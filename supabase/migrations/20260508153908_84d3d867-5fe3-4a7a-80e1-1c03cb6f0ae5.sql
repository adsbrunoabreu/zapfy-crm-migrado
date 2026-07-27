
CREATE OR REPLACE FUNCTION public.get_pipeline_performance_report(
  _company_id uuid,
  _from timestamptz,
  _to timestamptz,
  _pipeline_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_master boolean := public.has_role(_caller, 'master'::app_role);
  _user_company uuid;
  _result jsonb;
  _kpis jsonb;
  _stage_metrics jsonb;
  _daily jsonb;
  _transitions jsonb;
  _scope_company uuid;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  IF _is_master THEN
    _scope_company := _company_id;
  ELSE
    SELECT company_id INTO _user_company FROM public.profiles WHERE id = _caller;
    IF _user_company IS NULL THEN
      RAISE EXCEPTION 'no company';
    END IF;
    _scope_company := _user_company;
  END IF;

  -- KPIs
  WITH leads_scope AS (
    SELECT l.*
    FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
  ),
  events AS (
    SELECT lh.*
    FROM public.lead_history lh
    JOIN leads_scope l ON l.id = lh.lead_id
    WHERE lh.created_at >= _from AND lh.created_at <= _to
  ),
  status_events AS (
    SELECT * FROM events WHERE event_type = 'status_changed'
  ),
  reopens AS (
    SELECT * FROM status_events
    WHERE (payload->>'from') IN ('won','lost')
      AND COALESCE(payload->>'to','') NOT IN ('won','lost')
  ),
  closed AS (
    SELECT l.* FROM leads_scope l
    WHERE l.closed_at IS NOT NULL
      AND l.closed_at >= _from AND l.closed_at <= _to
  )
  SELECT jsonb_build_object(
    'total_leads', (SELECT count(*) FROM leads_scope),
    'won', (SELECT count(*) FROM closed WHERE status = 'won'),
    'lost', (SELECT count(*) FROM closed WHERE status = 'lost'),
    'closed', (SELECT count(*) FROM closed),
    'reopened', (SELECT count(*) FROM reopens),
    'avg_cycle_days', (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at))/86400.0)::numeric, 2)
      FROM closed
    ),
    'avg_response_hours', (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (responded_at - created_at))/3600.0)::numeric, 2)
      FROM leads_scope
      WHERE responded_at IS NOT NULL
        AND created_at >= _from AND created_at <= _to
    )
  ) INTO _kpis;

  -- Stage metrics: entries (count of stage_changed where to_stage_id = stage),
  -- exits, avg time-in-stage using LEAD() over events ordered per lead,
  -- current count (leads currently in stage).
  WITH leads_scope AS (
    SELECT l.id, l.stage_id, l.pipeline_id, l.company_id
    FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
  ),
  stages AS (
    SELECT s.id, s.name, s.color, s.position, s.stage_type, s.pipeline_id
    FROM public.pipeline_stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE p.company_id = _scope_company
      AND (_pipeline_id IS NULL OR s.pipeline_id = _pipeline_id)
  ),
  stage_changes AS (
    SELECT
      lh.lead_id,
      (lh.payload->>'from_stage_id')::uuid AS from_stage_id,
      (lh.payload->>'to_stage_id')::uuid AS to_stage_id,
      lh.created_at
    FROM public.lead_history lh
    JOIN leads_scope l ON l.id = lh.lead_id
    WHERE lh.event_type = 'stage_changed'
  ),
  stage_durations AS (
    SELECT
      sc.to_stage_id AS stage_id,
      sc.created_at AS entered_at,
      LEAD(sc.created_at) OVER (PARTITION BY sc.lead_id ORDER BY sc.created_at) AS exited_at
    FROM stage_changes sc
  ),
  duration_filtered AS (
    SELECT stage_id,
      EXTRACT(EPOCH FROM (COALESCE(exited_at, now()) - entered_at))/3600.0 AS hours
    FROM stage_durations
    WHERE entered_at <= _to
      AND COALESCE(exited_at, now()) >= _from
  ),
  entries AS (
    SELECT to_stage_id AS stage_id, count(*) AS entries
    FROM stage_changes
    WHERE created_at >= _from AND created_at <= _to
    GROUP BY to_stage_id
  ),
  exits AS (
    SELECT from_stage_id AS stage_id, count(*) AS exits
    FROM stage_changes
    WHERE created_at >= _from AND created_at <= _to AND from_stage_id IS NOT NULL
    GROUP BY from_stage_id
  ),
  current_counts AS (
    SELECT stage_id, count(*) AS current_count
    FROM leads_scope
    WHERE stage_id IS NOT NULL
    GROUP BY stage_id
  ),
  avg_dur AS (
    SELECT stage_id, ROUND(AVG(hours)::numeric, 2) AS avg_hours
    FROM duration_filtered
    GROUP BY stage_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.position), '[]'::jsonb) INTO _stage_metrics
  FROM (
    SELECT
      s.id AS stage_id,
      s.name,
      s.color,
      s.position,
      s.stage_type::text AS stage_type,
      s.pipeline_id,
      COALESCE(e.entries, 0) AS entries,
      COALESCE(x.exits, 0) AS exits,
      COALESCE(c.current_count, 0) AS current_count,
      COALESCE(a.avg_hours, 0) AS avg_hours_in_stage
    FROM stages s
    LEFT JOIN entries e ON e.stage_id = s.id
    LEFT JOIN exits x ON x.stage_id = s.id
    LEFT JOIN current_counts c ON c.stage_id = s.id
    LEFT JOIN avg_dur a ON a.stage_id = s.id
  ) x;

  -- Daily series of won/lost/reopened
  WITH days AS (
    SELECT generate_series(date_trunc('day', _from), date_trunc('day', _to), interval '1 day')::date AS day
  ),
  leads_scope AS (
    SELECT l.id FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
  ),
  won_lost AS (
    SELECT date_trunc('day', l.closed_at)::date AS day,
      sum(CASE WHEN l.status = 'won' THEN 1 ELSE 0 END) AS won,
      sum(CASE WHEN l.status = 'lost' THEN 1 ELSE 0 END) AS lost
    FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND l.closed_at IS NOT NULL
      AND l.closed_at >= _from AND l.closed_at <= _to
    GROUP BY 1
  ),
  reopens AS (
    SELECT date_trunc('day', lh.created_at)::date AS day, count(*) AS reopened
    FROM public.lead_history lh
    JOIN leads_scope ls ON ls.id = lh.lead_id
    WHERE lh.event_type = 'status_changed'
      AND (lh.payload->>'from') IN ('won','lost')
      AND COALESCE(lh.payload->>'to','') NOT IN ('won','lost')
      AND lh.created_at >= _from AND lh.created_at <= _to
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.day), '[]'::jsonb) INTO _daily
  FROM (
    SELECT d.day,
      COALESCE(w.won, 0) AS won,
      COALESCE(w.lost, 0) AS lost,
      COALESCE(r.reopened, 0) AS reopened
    FROM days d
    LEFT JOIN won_lost w ON w.day = d.day
    LEFT JOIN reopens r ON r.day = d.day
  ) x;

  -- Top transitions
  WITH leads_scope AS (
    SELECT l.id FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
  ),
  tr AS (
    SELECT
      (lh.payload->>'from_stage_id')::uuid AS from_id,
      (lh.payload->>'to_stage_id')::uuid AS to_id,
      count(*) AS cnt
    FROM public.lead_history lh
    JOIN leads_scope ls ON ls.id = lh.lead_id
    WHERE lh.event_type = 'stage_changed'
      AND lh.created_at >= _from AND lh.created_at <= _to
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.cnt DESC), '[]'::jsonb) INTO _transitions
  FROM (
    SELECT
      tr.from_id,
      sf.name AS from_name,
      sf.color AS from_color,
      tr.to_id,
      st.name AS to_name,
      st.color AS to_color,
      tr.cnt
    FROM tr
    LEFT JOIN public.pipeline_stages sf ON sf.id = tr.from_id
    LEFT JOIN public.pipeline_stages st ON st.id = tr.to_id
    WHERE tr.to_id IS NOT NULL
    LIMIT 15
  ) x;

  _result := jsonb_build_object(
    'kpis', _kpis,
    'stages', _stage_metrics,
    'daily', _daily,
    'transitions', _transitions
  );

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pipeline_performance_report(uuid, timestamptz, timestamptz, uuid) TO authenticated;
