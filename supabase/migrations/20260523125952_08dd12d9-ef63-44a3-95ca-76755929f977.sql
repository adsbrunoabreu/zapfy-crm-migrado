-- 1) get_company_growth: refaz com guard (case 'begin' minúsculo no original)
CREATE OR REPLACE FUNCTION public.get_company_growth(_company_id uuid, _days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_series jsonb;
  v_start timestamptz;
  v_today_sp timestamptz;
BEGIN
  -- [security guard] auto-injected
  IF _company_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'master'::public.app_role)
     AND NOT public.validate_user_belongs_to_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à empresa' USING ERRCODE='42501';
  END IF;

  IF NOT public.has_role(auth.uid(), 'master'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _days IS NULL OR _days <= 0 THEN _days := 30; END IF;
  IF _days > 180 THEN _days := 180; END IF;

  v_today_sp := (date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo'))) AT TIME ZONE 'America/Sao_Paulo';
  v_start := v_today_sp - make_interval(days => _days - 1);

  WITH days AS (
    SELECT generate_series(
      (v_start AT TIME ZONE 'America/Sao_Paulo')::date,
      (v_today_sp AT TIME ZONE 'America/Sao_Paulo')::date,
      interval '1 day'
    )::date AS d
  ),
  l AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*) AS c
    FROM public.leads WHERE company_id = _company_id AND created_at >= v_start GROUP BY 1
  ),
  m AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*) AS c
    FROM public.messages WHERE company_id = _company_id AND created_at >= v_start GROUP BY 1
  ),
  o AS (
    SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS d, count(*) AS c
    FROM public.store_orders WHERE company_id = _company_id AND created_at >= v_start GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(days.d, 'YYYY-MM-DD'),
    'leads', coalesce(l.c, 0),
    'messages', coalesce(m.c, 0),
    'orders', coalesce(o.c, 0)
  ) ORDER BY days.d) INTO v_series
  FROM days LEFT JOIN l ON l.d=days.d LEFT JOIN m ON m.d=days.d LEFT JOIN o ON o.d=days.d;

  RETURN jsonb_build_object(
    'company_id', _company_id,
    'days', _days,
    'series', coalesce(v_series, '[]'::jsonb),
    'generated_at', now()
  );
END;
$function$;

-- 2) get_company_plan_limits: SQL -> PL/pgSQL com guard
CREATE OR REPLACE FUNCTION public.get_company_plan_limits(_company_id uuid)
RETURNS TABLE(max_users integer, max_leads integer, max_whatsapp_instances integer, max_pipelines integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- [security guard] auto-injected
  IF _company_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'master'::public.app_role)
     AND NOT public.validate_user_belongs_to_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à empresa' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT sp.max_users, sp.max_leads, sp.max_whatsapp_instances, sp.max_pipelines
    FROM public.companies c
    LEFT JOIN public.subscription_plans sp ON sp.id = c.selected_plan_id
    WHERE c.id = _company_id;
END;
$function$;

-- 3) get_company_plan_usage
CREATE OR REPLACE FUNCTION public.get_company_plan_usage(_company_id uuid)
RETURNS TABLE(users_count integer, pending_invites_count integer, instances_count integer, leads_count integer, pipelines_count integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- [security guard] auto-injected
  IF _company_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'master'::public.app_role)
     AND NOT public.validate_user_belongs_to_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à empresa' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT
      (SELECT count(*)::int FROM public.profiles WHERE company_id = _company_id),
      (SELECT count(*)::int FROM public.team_invites
         WHERE company_id = _company_id AND status = 'pending'
           AND email NOT IN (SELECT email FROM public.profiles WHERE company_id = _company_id)),
      (SELECT count(*)::int FROM public.whatsapp_instances WHERE company_id = _company_id),
      (SELECT count(*)::int FROM public.leads WHERE company_id = _company_id),
      (SELECT count(*)::int FROM public.pipelines WHERE company_id = _company_id);
END;
$function$;

-- 4) get_company_trial_info
CREATE OR REPLACE FUNCTION public.get_company_trial_info(_company_id uuid)
RETURNS TABLE(plan_status text, trial_ends_at timestamp with time zone, days_left integer, hours_left integer, expired boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- [security guard] auto-injected
  IF _company_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'master'::public.app_role)
     AND NOT public.validate_user_belongs_to_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à empresa' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
    SELECT
      c.plan_status::text,
      c.trial_ends_at,
      GREATEST(0, CEIL(EXTRACT(EPOCH FROM (c.trial_ends_at - now())) / 86400))::int,
      GREATEST(0, CEIL(EXTRACT(EPOCH FROM (c.trial_ends_at - now())) / 3600))::int,
      (c.plan_status = 'trial' AND c.trial_ends_at IS NOT NULL AND c.trial_ends_at <= now())
    FROM public.companies c WHERE c.id = _company_id;
END;
$function$;

-- 5) get_evolution_proxy_metrics
CREATE OR REPLACE FUNCTION public.get_evolution_proxy_metrics(_hours integer DEFAULT 24, _company_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(company_id uuid, company_name text, instance_name text, total_calls bigint, errors bigint, not_found bigint, server_errors bigint, rate_limited bigint, network_errors bigint, error_rate numeric, not_found_rate numeric, server_error_rate numeric, avg_latency_ms numeric, p95_latency_ms numeric, last_event_at timestamp with time zone)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- [security guard] auto-injected
  IF _company_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'master'::public.app_role)
     AND NOT public.validate_user_belongs_to_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à empresa' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  WITH src AS (
    SELECT
      sl.company_id,
      sl.instance_name,
      sl.level,
      coalesce((sl.metadata->>'status')::int, 0) AS status,
      sl.metadata->>'statusClass' AS status_class,
      coalesce((sl.metadata->>'latencyMs')::numeric, 0) AS latency_ms,
      sl.created_at
    FROM public.system_logs sl
    WHERE sl.source = 'evolution-proxy'
      AND sl.created_at >= now() - make_interval(hours => greatest(_hours, 1))
      AND (_company_id IS NULL OR sl.company_id = _company_id)
      AND (public.is_master(auth.uid()) OR sl.company_id = public.get_user_company_id(auth.uid()))
  )
  SELECT
    s.company_id,
    c.name AS company_name,
    coalesce(s.instance_name, '(sem instância)') AS instance_name,
    count(*)::bigint AS total_calls,
    count(*) FILTER (WHERE s.level IN ('error','warn'))::bigint AS errors,
    count(*) FILTER (WHERE s.status_class = '404')::bigint AS not_found,
    count(*) FILTER (WHERE s.status_class = '5xx')::bigint AS server_errors,
    count(*) FILTER (WHERE s.status_class = 'rate_limited')::bigint AS rate_limited,
    count(*) FILTER (WHERE s.status_class = 'network_error')::bigint AS network_errors,
    round(100.0 * count(*) FILTER (WHERE s.level IN ('error','warn'))::numeric / nullif(count(*),0), 2) AS error_rate,
    round(100.0 * count(*) FILTER (WHERE s.status_class = '404')::numeric / nullif(count(*),0), 2) AS not_found_rate,
    round(100.0 * count(*) FILTER (WHERE s.status_class = '5xx')::numeric / nullif(count(*),0), 2) AS server_error_rate,
    round(avg(s.latency_ms) FILTER (WHERE s.latency_ms > 0), 1) AS avg_latency_ms,
    round(percentile_cont(0.95) WITHIN GROUP (ORDER BY s.latency_ms) FILTER (WHERE s.latency_ms > 0)::numeric, 1) AS p95_latency_ms,
    max(s.created_at) AS last_event_at
  FROM src s
  LEFT JOIN public.companies c ON c.id = s.company_id
  GROUP BY s.company_id, c.name, s.instance_name
  ORDER BY total_calls DESC;
END;
$function$;

-- 6) has_financial_access
CREATE OR REPLACE FUNCTION public.has_financial_access(_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- [security guard] auto-injected
  IF _company_id IS NOT NULL AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'master'::public.app_role)
     AND NOT public.validate_user_belongs_to_company(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'Acesso negado: usuário não pertence à empresa' USING ERRCODE='42501';
  END IF;
  RETURN
    public.has_role(auth.uid(), 'master'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = _company_id
        AND p.role IN ('admin','financeiro','gestor')
    );
END;
$function$;