
ALTER TABLE public.ai_agent_runs
  ADD COLUMN IF NOT EXISTS kb_citations jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS kb_document_ids uuid[] NULL;

DROP FUNCTION IF EXISTS public.match_ai_knowledge(uuid, vector, int, float);

CREATE OR REPLACE FUNCTION public.match_ai_knowledge(
  _agent_id uuid,
  _query_embedding vector(768),
  _match_count int DEFAULT 5,
  _min_similarity float DEFAULT 0.5,
  _document_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  file_name text,
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
    d.file_name,
    c.content,
    1 - (c.embedding <=> _query_embedding) AS similarity
  FROM public.ai_knowledge_chunks c
  JOIN public.ai_knowledge_documents d ON d.id = c.document_id
  WHERE c.agent_id = _agent_id
    AND c.embedding IS NOT NULL
    AND (1 - (c.embedding <=> _query_embedding)) >= _min_similarity
    AND (_document_ids IS NULL OR array_length(_document_ids, 1) IS NULL OR c.document_id = ANY(_document_ids))
  ORDER BY c.embedding <=> _query_embedding ASC
  LIMIT _match_count;
END;
$$;
