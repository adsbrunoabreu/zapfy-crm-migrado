
-- Extensão para embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Knowledge documents ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  status text NOT NULL DEFAULT 'pending',
  chunks_count int NOT NULL DEFAULT 0,
  error text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ai_kd_company ON public.ai_knowledge_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_kd_agent ON public.ai_knowledge_documents(agent_id);

ALTER TABLE public.ai_knowledge_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own kb docs"
  ON public.ai_knowledge_documents FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins insert own kb docs"
  ON public.ai_knowledge_documents FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_admin(auth.uid())
    AND is_ai_agent_enabled(company_id)
  );

CREATE POLICY "Admins update own kb docs"
  ON public.ai_knowledge_documents FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Admins delete own kb docs"
  ON public.ai_knowledge_documents FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Masters manage all kb docs"
  ON public.ai_knowledge_documents FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

-- ─── Knowledge chunks (vetores) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.ai_knowledge_documents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  chunk_index int NOT NULL,
  content text NOT NULL,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_kc_document ON public.ai_knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_ai_kc_agent ON public.ai_knowledge_chunks(agent_id);
CREATE INDEX IF NOT EXISTS idx_ai_kc_embedding ON public.ai_knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own kb chunks"
  ON public.ai_knowledge_chunks FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Masters manage all kb chunks"
  ON public.ai_knowledge_chunks FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

-- ─── Bucket privado para uploads de KB ──────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('ai-knowledge', 'ai-knowledge', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Members read own ai-knowledge files"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ai-knowledge'
    AND (
      is_master(auth.uid())
      OR (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
    )
  );

CREATE POLICY "Admins upload own ai-knowledge files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ai-knowledge'
    AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
    AND is_company_admin(auth.uid())
  );

CREATE POLICY "Admins delete own ai-knowledge files"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ai-knowledge'
    AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
    AND is_company_admin(auth.uid())
  );

-- ─── Pause global por agente ────────────────────────────────────────
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS paused_until timestamptz;

-- ─── Controle de alertas de uso (idempotência mensal) ──────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ai_usage_alert_80_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_usage_alert_100_sent_at timestamptz;

-- ─── Função de busca semântica ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.match_ai_knowledge(
  _agent_id uuid,
  _query_embedding vector(768),
  _match_count int DEFAULT 5,
  _min_similarity float DEFAULT 0.5
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
  _agent_company uuid;
BEGIN
  SELECT company_id INTO _agent_company FROM public.ai_agents WHERE id = _agent_id;
  IF _agent_company IS NULL THEN RETURN; END IF;

  -- Master ou membro da empresa do agente
  IF NOT is_master(auth.uid()) THEN
    _cid := get_user_company_id(auth.uid());
    IF _cid IS NULL OR _cid <> _agent_company THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    c.content,
    1 - (c.embedding <=> _query_embedding) AS similarity
  FROM public.ai_knowledge_chunks c
  WHERE c.agent_id = _agent_id
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> _query_embedding)) >= _min_similarity
  ORDER BY c.embedding <=> _query_embedding
  LIMIT _match_count;
END;
$$;
