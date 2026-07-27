CREATE OR REPLACE FUNCTION public.ai_agent_pipeline_checklist()
RETURNS TABLE (
  company_id uuid,
  company_name text,
  ai_agent_enabled boolean,
  plan_status text,
  total_pipelines integer,
  default_pipeline_id uuid,
  default_pipeline_name text,
  default_pipelines_count integer,
  active_agent_on_default_id uuid,
  active_agent_on_default_name text,
  total_active_agents integer,
  status text,
  issues text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_master_user boolean := public.is_master(auth.uid());
  caller_company uuid := public.get_user_company_id(auth.uid());
  is_admin boolean := public.is_company_admin(auth.uid());
BEGIN
  IF NOT is_master_user AND NOT is_admin THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT c.id, c.name, c.ai_agent_enabled, c.plan_status::text AS plan_status
    FROM public.companies c
    WHERE is_master_user OR c.id = caller_company
  ),
  pipe_stats AS (
    SELECT
      s.id AS company_id,
      COUNT(p.id)::int AS total_pipelines,
      COUNT(p.id) FILTER (WHERE p.is_default)::int AS default_pipelines_count
    FROM scoped s
    LEFT JOIN public.pipelines p ON p.company_id = s.id
    GROUP BY s.id
  ),
  default_pipe AS (
    SELECT DISTINCT ON (p.company_id)
      p.company_id, p.id, p.name
    FROM public.pipelines p
    WHERE p.is_default
    ORDER BY p.company_id, p.created_at NULLS LAST
  ),
  agent_on_default AS (
    SELECT DISTINCT ON (a.company_id)
      a.company_id, a.id, a.name
    FROM public.ai_agents a
    JOIN default_pipe d ON d.company_id = a.company_id AND d.id = a.pipeline_id
    WHERE a.is_active
    ORDER BY a.company_id, a.created_at NULLS LAST
  ),
  active_agents AS (
    SELECT a.company_id, COUNT(*)::int AS total_active_agents
    FROM public.ai_agents a
    WHERE a.is_active
    GROUP BY a.company_id
  )
  SELECT
    s.id,
    s.name,
    s.ai_agent_enabled,
    s.plan_status,
    COALESCE(ps.total_pipelines, 0),
    dp.id,
    dp.name,
    COALESCE(ps.default_pipelines_count, 0),
    aod.id,
    aod.name,
    COALESCE(aa.total_active_agents, 0),
    CASE
      WHEN dp.id IS NULL THEN 'error'
      WHEN COALESCE(ps.default_pipelines_count, 0) > 1 THEN 'warning'
      WHEN s.ai_agent_enabled AND aod.id IS NULL THEN 'error'
      WHEN NOT s.ai_agent_enabled THEN 'warning'
      ELSE 'ok'
    END,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN dp.id IS NULL THEN 'Nenhuma pipeline marcada como padrão' END,
      CASE WHEN COALESCE(ps.default_pipelines_count, 0) > 1 THEN 'Mais de uma pipeline marcada como padrão' END,
      CASE WHEN s.ai_agent_enabled AND aod.id IS NULL THEN 'Add-on de IA ativo, mas sem agente ativo na pipeline padrão' END,
      CASE WHEN NOT s.ai_agent_enabled THEN 'Add-on de IA desativado para a empresa' END,
      CASE WHEN COALESCE(aa.total_active_agents, 0) = 0 THEN 'Nenhum agente ativo cadastrado' END
    ], NULL)
  FROM scoped s
  LEFT JOIN pipe_stats ps ON ps.company_id = s.id
  LEFT JOIN default_pipe dp ON dp.company_id = s.id
  LEFT JOIN agent_on_default aod ON aod.company_id = s.id
  LEFT JOIN active_agents aa ON aa.company_id = s.id
  ORDER BY s.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_agent_pipeline_checklist() TO authenticated;