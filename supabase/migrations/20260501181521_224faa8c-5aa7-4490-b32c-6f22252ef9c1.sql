-- 1. Flag de add-on na empresa
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS ai_agent_enabled boolean NOT NULL DEFAULT false;

-- 2. Helper: verifica se o add-on está ativo na empresa
CREATE OR REPLACE FUNCTION public.is_ai_agent_enabled(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id
      AND ai_agent_enabled = true
      AND plan_status IN ('active', 'trial')
  )
$$;

-- 3. Tabela de agentes IA (1 por pipeline)
CREATE TABLE IF NOT EXISTS public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  pipeline_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Assistente',
  persona text NOT NULL DEFAULT 'Atendente cordial e prestativo',
  system_prompt text NOT NULL DEFAULT 'Você é um assistente virtual de pré-atendimento. Seja breve, humano e cordial. Faça uma pergunta por vez. Use português do Brasil informal.',
  model text NOT NULL DEFAULT 'google/gemini-2.5-flash',
  is_active boolean NOT NULL DEFAULT true,
  max_turns integer NOT NULL DEFAULT 15,
  handoff_keywords text[] NOT NULL DEFAULT ARRAY['atendente','humano','pessoa','falar com alguém','cancelar'],
  collect_fields jsonb NOT NULL DEFAULT '["nome","necessidade","orcamento","urgencia"]'::jsonb,
  transfer_stage_id uuid,
  business_hours_only boolean NOT NULL DEFAULT false,
  response_delay_ms integer NOT NULL DEFAULT 1500,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pipeline_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_company ON public.ai_agents(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_agents_active ON public.ai_agents(company_id, is_active) WHERE is_active = true;

ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage all ai_agents"
ON public.ai_agents FOR ALL
TO authenticated
USING (is_master(auth.uid()))
WITH CHECK (is_master(auth.uid()));

CREATE POLICY "Company members view own ai_agents"
ON public.ai_agents FOR SELECT
TO authenticated
USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Company admins insert ai_agents when enabled"
ON public.ai_agents FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_admin(auth.uid())
  AND is_ai_agent_enabled(company_id)
);

CREATE POLICY "Company admins update ai_agents when enabled"
ON public.ai_agents FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_admin(auth.uid())
  AND is_ai_agent_enabled(company_id)
)
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_ai_agent_enabled(company_id)
);

CREATE POLICY "Company admins delete ai_agents"
ON public.ai_agents FOR DELETE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_admin(auth.uid())
);

CREATE TRIGGER trg_ai_agents_updated_at
BEFORE UPDATE ON public.ai_agents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Estado da IA em cada conversa
CREATE TABLE IF NOT EXISTS public.conversation_ai_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  conversation_id uuid NOT NULL UNIQUE,
  agent_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','handoff','done','error')),
  turn_count integer NOT NULL DEFAULT 0,
  collected_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  last_run_at timestamptz,
  paused_until timestamptz,
  handoff_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_state_company ON public.conversation_ai_state(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_state_status ON public.conversation_ai_state(status, paused_until);

ALTER TABLE public.conversation_ai_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage all ai_state"
ON public.conversation_ai_state FOR ALL
TO authenticated
USING (is_master(auth.uid()))
WITH CHECK (is_master(auth.uid()));

CREATE POLICY "Company members view ai_state"
ON public.conversation_ai_state FOR SELECT
TO authenticated
USING (company_id = get_user_company_id(auth.uid()));

CREATE TRIGGER trg_ai_state_updated_at
BEFORE UPDATE ON public.conversation_ai_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Log de execuções
CREATE TABLE IF NOT EXISTS public.ai_agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  trigger_message_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','error','skipped')),
  input_summary text,
  output_text text,
  tools_called jsonb DEFAULT '[]'::jsonb,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  model text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_runs_conv ON public.ai_agent_runs(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_company ON public.ai_agent_runs(company_id, created_at DESC);

ALTER TABLE public.ai_agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters view all ai_runs"
ON public.ai_agent_runs FOR SELECT
TO authenticated
USING (is_master(auth.uid()));

CREATE POLICY "Company admins view ai_runs"
ON public.ai_agent_runs FOR SELECT
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_admin(auth.uid())
);

-- (writes acontecem via service role na edge function)

-- 6. Auditoria do toggle do add-on em company_status_audit (reaproveita)
-- Já existe, basta usar reason='ai_agent_toggled'