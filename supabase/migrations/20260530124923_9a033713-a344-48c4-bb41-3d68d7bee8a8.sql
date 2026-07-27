
-- ============================================================================
-- 1) team_goal_groups + members
-- ============================================================================
CREATE TABLE public.team_goal_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE(company_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_goal_groups TO authenticated;
GRANT ALL ON public.team_goal_groups TO service_role;

ALTER TABLE public.team_goal_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view goal groups" ON public.team_goal_groups
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Managers insert goal groups" ON public.team_goal_groups
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid())
              AND is_company_manager(auth.uid())
              AND is_company_active(company_id));

CREATE POLICY "Managers update goal groups" ON public.team_goal_groups
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_manager(auth.uid()));

CREATE POLICY "Managers delete goal groups" ON public.team_goal_groups
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_manager(auth.uid()));

CREATE INDEX idx_team_goal_groups_company ON public.team_goal_groups(company_id);

CREATE TABLE public.team_goal_group_members (
  group_id uuid NOT NULL REFERENCES public.team_goal_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

GRANT SELECT, INSERT, DELETE ON public.team_goal_group_members TO authenticated;
GRANT ALL ON public.team_goal_group_members TO service_role;

ALTER TABLE public.team_goal_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view group members" ON public.team_goal_group_members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_goal_groups g
    WHERE g.id = group_id AND g.company_id = get_user_company_id(auth.uid())
  ));

CREATE POLICY "Managers insert group members" ON public.team_goal_group_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.team_goal_groups g
    WHERE g.id = group_id
      AND g.company_id = get_user_company_id(auth.uid())
      AND is_company_manager(auth.uid())
  ));

CREATE POLICY "Managers delete group members" ON public.team_goal_group_members
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.team_goal_groups g
    WHERE g.id = group_id
      AND g.company_id = get_user_company_id(auth.uid())
      AND is_company_manager(auth.uid())
  ));

-- ============================================================================
-- 2) team_goals
-- ============================================================================
CREATE TABLE public.team_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('company', 'group', 'pipeline')),
  group_id uuid REFERENCES public.team_goal_groups(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE,
  metric text NOT NULL CHECK (metric IN ('leads','value','conversions','ticket_avg','conversion_rate','response_time','messages_sent')),
  target_value numeric NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (scope = 'company' AND group_id IS NULL AND pipeline_id IS NULL) OR
    (scope = 'group' AND group_id IS NOT NULL AND pipeline_id IS NULL) OR
    (scope = 'pipeline' AND pipeline_id IS NOT NULL AND group_id IS NULL)
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_goals TO authenticated;
GRANT ALL ON public.team_goals TO service_role;

ALTER TABLE public.team_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view team goals" ON public.team_goals
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Managers insert team goals" ON public.team_goals
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid())
              AND is_company_manager(auth.uid())
              AND is_company_active(company_id));

CREATE POLICY "Managers update team goals" ON public.team_goals
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_manager(auth.uid()));

CREATE POLICY "Managers delete team goals" ON public.team_goals
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_manager(auth.uid()));

CREATE INDEX idx_team_goals_company ON public.team_goals(company_id);
CREATE INDEX idx_team_goals_period ON public.team_goals(period_start, period_end);

CREATE TRIGGER trg_team_goals_updated_at
BEFORE UPDATE ON public.team_goals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_team_goal_groups_updated_at
BEFORE UPDATE ON public.team_goal_groups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3) Estender user_goals.goal_type para incluir novas métricas
-- ============================================================================
ALTER TABLE public.user_goals DROP CONSTRAINT IF EXISTS user_goals_goal_type_check;
ALTER TABLE public.user_goals ADD CONSTRAINT user_goals_goal_type_check
  CHECK (goal_type IN ('leads','value','conversions','ticket_avg','conversion_rate','response_time','messages_sent'));

-- ============================================================================
-- 4) RPC: get_goal_progress
-- Retorna valor atual da métrica para um conjunto de usuários ou pipeline.
-- Se p_user_ids vazio/null e p_pipeline_id null => empresa toda
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_goal_progress(
  p_metric text,
  p_user_ids uuid[],
  p_pipeline_id uuid,
  p_period_start date,
  p_period_end date
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := get_user_company_id(auth.uid());
  v_result numeric := 0;
  v_total int := 0;
  v_won int := 0;
  v_users uuid[];
BEGIN
  IF v_company IS NULL THEN RETURN 0; END IF;

  -- Normaliza user_ids: null/empty significa "todos da empresa"
  v_users := NULLIF(p_user_ids, ARRAY[]::uuid[]);

  IF p_metric = 'leads' THEN
    SELECT count(*) INTO v_result FROM public.leads l
    WHERE l.company_id = v_company
      AND l.created_at::date >= p_period_start
      AND l.created_at::date <= p_period_end
      AND (v_users IS NULL OR l.assigned_to = ANY(v_users))
      AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id);

  ELSIF p_metric = 'value' THEN
    SELECT COALESCE(SUM(l.value),0) INTO v_result FROM public.leads l
    WHERE l.company_id = v_company
      AND l.status = 'won'
      AND l.created_at::date >= p_period_start
      AND l.created_at::date <= p_period_end
      AND (v_users IS NULL OR l.assigned_to = ANY(v_users))
      AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id);

  ELSIF p_metric = 'conversions' THEN
    SELECT count(*) INTO v_result FROM public.leads l
    WHERE l.company_id = v_company
      AND l.status = 'won'
      AND l.created_at::date >= p_period_start
      AND l.created_at::date <= p_period_end
      AND (v_users IS NULL OR l.assigned_to = ANY(v_users))
      AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id);

  ELSIF p_metric = 'ticket_avg' THEN
    SELECT COALESCE(AVG(l.value),0) INTO v_result FROM public.leads l
    WHERE l.company_id = v_company
      AND l.status = 'won'
      AND l.value > 0
      AND l.created_at::date >= p_period_start
      AND l.created_at::date <= p_period_end
      AND (v_users IS NULL OR l.assigned_to = ANY(v_users))
      AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id);

  ELSIF p_metric = 'conversion_rate' THEN
    SELECT count(*) FILTER (WHERE l.status = 'won'),
           count(*)
      INTO v_won, v_total
    FROM public.leads l
    WHERE l.company_id = v_company
      AND l.created_at::date >= p_period_start
      AND l.created_at::date <= p_period_end
      AND (v_users IS NULL OR l.assigned_to = ANY(v_users))
      AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id);
    v_result := CASE WHEN v_total > 0 THEN (v_won::numeric / v_total) * 100 ELSE 0 END;

  ELSIF p_metric = 'response_time' THEN
    -- Média em segundos entre created_at e responded_at
    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (l.responded_at - l.created_at))),0)
      INTO v_result FROM public.leads l
    WHERE l.company_id = v_company
      AND l.responded_at IS NOT NULL
      AND l.created_at::date >= p_period_start
      AND l.created_at::date <= p_period_end
      AND (v_users IS NULL OR l.assigned_to = ANY(v_users))
      AND (p_pipeline_id IS NULL OR l.pipeline_id = p_pipeline_id);

  ELSIF p_metric = 'messages_sent' THEN
    -- Mensagens outbound (from_me = true) das conversas dos usuários
    SELECT count(*) INTO v_result
    FROM public.chat_messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.company_id = v_company
      AND m.from_me = true
      AND m.created_at::date >= p_period_start
      AND m.created_at::date <= p_period_end
      AND (v_users IS NULL OR c.assigned_to = ANY(v_users));
  END IF;

  RETURN COALESCE(v_result, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_goal_progress(text, uuid[], uuid, date, date) TO authenticated;

-- ============================================================================
-- 5) RPC: suggest_goal_target — média dos últimos 3 períodos equivalentes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.suggest_goal_target(
  p_metric text,
  p_user_ids uuid[],
  p_pipeline_id uuid,
  p_period_days int
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_p1 numeric;
  v_p2 numeric;
  v_p3 numeric;
  v_baseline numeric;
BEGIN
  IF p_period_days <= 0 THEN p_period_days := 30; END IF;

  v_p1 := public.get_goal_progress(p_metric, p_user_ids, p_pipeline_id,
                                    v_today - (p_period_days)::int,
                                    v_today - 1);
  v_p2 := public.get_goal_progress(p_metric, p_user_ids, p_pipeline_id,
                                    v_today - (p_period_days*2)::int,
                                    v_today - (p_period_days+1)::int);
  v_p3 := public.get_goal_progress(p_metric, p_user_ids, p_pipeline_id,
                                    v_today - (p_period_days*3)::int,
                                    v_today - (p_period_days*2+1)::int);

  v_baseline := (COALESCE(v_p1,0) + COALESCE(v_p2,0) + COALESCE(v_p3,0)) / 3.0;

  RETURN jsonb_build_object(
    'baseline', round(v_baseline, 2),
    'p1', round(COALESCE(v_p1,0), 2),
    'p2', round(COALESCE(v_p2,0), 2),
    'p3', round(COALESCE(v_p3,0), 2),
    'conservative', round(v_baseline * 0.9, 2),
    'realistic', round(v_baseline * 1.0, 2),
    'aggressive', round(v_baseline * 1.3, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_goal_target(text, uuid[], uuid, int) TO authenticated;
