-- 1. Novos campos no ai_agents
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS emoji text,
  ADD COLUMN IF NOT EXISTS detect_negative_sentiment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS send_discount_coupon boolean NOT NULL DEFAULT false;

-- 2. Tabela de histórico de configurações do agente
CREATE TABLE IF NOT EXISTS public.ai_agent_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  pipeline_id uuid,
  version int NOT NULL,
  snapshot jsonb NOT NULL,
  change_summary text,
  changed_by uuid,
  changed_by_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_agent_history_agent ON public.ai_agent_history(agent_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_ai_agent_history_company ON public.ai_agent_history(company_id, created_at DESC);

ALTER TABLE public.ai_agent_history ENABLE ROW LEVEL SECURITY;

-- RLS: admins da empresa veem o próprio histórico
CREATE POLICY "Company admins view own history"
  ON public.ai_agent_history FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid()));

CREATE POLICY "Company admins insert own history"
  ON public.ai_agent_history FOR INSERT TO authenticated
  WITH CHECK ((company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid()) AND is_company_active(company_id));

CREATE POLICY "Masters manage all history"
  ON public.ai_agent_history FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

-- 3. Função utilitária: registra um snapshot do agente atual
CREATE OR REPLACE FUNCTION public.log_ai_agent_history(
  _agent_id uuid,
  _change_summary text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent ai_agents%ROWTYPE;
  v_next_version int;
  v_id uuid;
  v_user_id uuid;
  v_user_name text;
BEGIN
  SELECT * INTO v_agent FROM public.ai_agents WHERE id = _agent_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.ai_agent_history WHERE agent_id = _agent_id;

  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO v_user_name
      FROM public.profiles WHERE id = v_user_id;
  END IF;

  INSERT INTO public.ai_agent_history (
    company_id, agent_id, pipeline_id, version,
    snapshot, change_summary, changed_by, changed_by_name
  ) VALUES (
    v_agent.company_id, _agent_id, v_agent.pipeline_id, v_next_version,
    to_jsonb(v_agent), _change_summary, v_user_id, v_user_name
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- 4. Trigger: snapshot automático após cada UPDATE/INSERT em ai_agents
CREATE OR REPLACE FUNCTION public.tg_ai_agent_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_ai_agent_history(
    NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'Agente criado' ELSE 'Configuração atualizada' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_agent_snapshot ON public.ai_agents;
CREATE TRIGGER trg_ai_agent_snapshot
  AFTER INSERT OR UPDATE ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.tg_ai_agent_snapshot();