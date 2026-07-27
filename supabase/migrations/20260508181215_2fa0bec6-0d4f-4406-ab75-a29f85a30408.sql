CREATE OR REPLACE FUNCTION public.get_pipeline_performance_report(
  _company_id uuid,
  _from timestamp with time zone,
  _to timestamp with time zone,
  _pipeline_id uuid DEFAULT NULL::uuid,
  _user_id uuid DEFAULT NULL::uuid,
  _status text DEFAULT NULL::text,
  _loss_reason_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _is_master boolean := public.has_role(_caller, 'master'::app_role);
  _user_company uuid;
  _result jsonb;
  _kpis jsonb;
  _stage_metrics jsonb;
  _daily jsonb;
  _transitions jsonb;
  _by_pipeline jsonb;
  _by_user jsonb;
  _by_loss_reason jsonb;
  _loss_reason_daily jsonb;
  _scope_company uuid;
  _user_filter uuid := NULLIF(_user_id, '00000000-0000-0000-0000-000000000000'::uuid);
  _unassigned boolean := COALESCE(_user_id = '00000000-0000-0000-0000-000000000000'::uuid, false);
  _status_norm text := lower(NULLIF(trim(coalesce(_status,'')), ''));
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT company_id INTO _user_company FROM public.profiles WHERE id = _caller;

  IF _is_master THEN
    _scope_company := COALESCE(_company_id, _user_company);
  ELSE
    IF _user_company IS NULL THEN
      RAISE EXCEPTION 'no company';
    END IF;
    _scope_company := _user_company;
  END IF;

  IF _scope_company IS NULL THEN
    RAISE EXCEPTION 'no company scope resolved';
  END IF;

  WITH leads_scope AS (
    SELECT l.*
    FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (
        (_unassigned IS TRUE AND l.assigned_to IS NULL)
        OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter))
      )
      AND (_loss_reason_id IS NULL OR l.loss_reason_id = _loss_reason_id)
      AND (
        _status_norm IS NULL OR _status_norm IN ('all','')
        OR (_status_norm = 'open' AND l.status NOT IN ('won','lost'))
        OR (_status_norm = 'won' AND l.status = 'won')
        OR (_status_norm = 'lost' AND l.status = 'lost')
        OR _status_norm = 'reopened'
      )
  ),
  closed AS (
    SELECT l.* FROM leads_scope l
    WHERE l.closed_at IS NOT NULL
      AND l.closed_at >= _from AND l.closed_at <= _to
  ),
  in_period AS (
    SELECT l.* FROM leads_scope l
    WHERE l.created_at >= _from AND l.created_at <= _to
  ),
  reopens AS (
    SELECT lh.*
    FROM public.lead_history lh
    JOIN leads_scope l ON l.id = lh.lead_id
    WHERE lh.created_at >= _from AND lh.created_at <= _to
      AND lh.event_type = 'status_changed'
      AND (lh.payload->>'from') IN ('won','lost')
      AND COALESCE(lh.payload->>'to','') NOT IN ('won','lost')
  )
  SELECT jsonb_build_object(
    'total_leads', (SELECT count(*) FROM in_period),
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
    ),
    'revenue_won', COALESCE((SELECT SUM(value) FROM closed WHERE status = 'won' AND value IS NOT NULL), 0),
    'revenue_lost', COALESCE((SELECT SUM(value) FROM closed WHERE status = 'lost' AND value IS NOT NULL), 0),
    'avg_ticket_won', (
      SELECT ROUND(AVG(value)::numeric, 2) FROM closed WHERE status = 'won' AND value IS NOT NULL
    ),
    'pipeline_value', COALESCE((SELECT SUM(value) FROM in_period WHERE value IS NOT NULL), 0),
    'avg_ticket_all', (
      SELECT ROUND(AVG(value)::numeric, 2) FROM in_period WHERE value IS NOT NULL
    )
  ) INTO _kpis;

  WITH leads_scope AS (
    SELECT l.id, l.stage_id, l.pipeline_id
    FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (
        (_unassigned IS TRUE AND l.assigned_to IS NULL)
        OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter))
      )
  ),
  stages AS (
    SELECT s.id, s.name, s.color, s.position, s.stage_type, s.pipeline_id
    FROM public.pipeline_stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE p.company_id = _scope_company
      AND (_pipeline_id IS NULL OR s.pipeline_id = _pipeline_id)
  ),
  stage_changes AS (
    SELECT lh.lead_id,
      (lh.payload->>'from_stage_id')::uuid AS from_stage_id,
      (lh.payload->>'to_stage_id')::uuid AS to_stage_id,
      lh.created_at
    FROM public.lead_history lh
    JOIN leads_scope l ON l.id = lh.lead_id
    WHERE lh.event_type = 'stage_changed'
  ),
  stage_durations AS (
    SELECT sc.to_stage_id AS stage_id, sc.created_at AS entered_at,
      LEAD(sc.created_at) OVER (PARTITION BY sc.lead_id ORDER BY sc.created_at) AS exited_at
    FROM stage_changes sc
  ),
  duration_filtered AS (
    SELECT stage_id, EXTRACT(EPOCH FROM (COALESCE(exited_at, now()) - entered_at))/3600.0 AS hours
    FROM stage_durations
    WHERE entered_at <= _to AND COALESCE(exited_at, now()) >= _from
  ),
  entries AS (
    SELECT to_stage_id AS stage_id, count(*) AS entries
    FROM stage_changes WHERE created_at >= _from AND created_at <= _to
    GROUP BY to_stage_id
  ),
  exits AS (
    SELECT from_stage_id AS stage_id, count(*) AS exits
    FROM stage_changes WHERE created_at >= _from AND created_at <= _to AND from_stage_id IS NOT NULL
    GROUP BY from_stage_id
  ),
  current_counts AS (
    SELECT stage_id, count(*) AS current_count FROM leads_scope WHERE stage_id IS NOT NULL GROUP BY stage_id
  ),
  avg_dur AS (
    SELECT stage_id, ROUND(AVG(hours)::numeric, 2) AS avg_hours FROM duration_filtered GROUP BY stage_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.position), '[]'::jsonb) INTO _stage_metrics
  FROM (
    SELECT s.id AS stage_id, s.name, s.color, s.position, s.stage_type::text AS stage_type, s.pipeline_id,
      COALESCE(e.entries, 0) AS entries,
      COALESCE(x2.exits, 0) AS exits,
      COALESCE(c.current_count, 0) AS current_count,
      COALESCE(a.avg_hours, 0) AS avg_hours_in_stage
    FROM stages s
    LEFT JOIN entries e ON e.stage_id = s.id
    LEFT JOIN exits x2 ON x2.stage_id = s.id
    LEFT JOIN current_counts c ON c.stage_id = s.id
    LEFT JOIN avg_dur a ON a.stage_id = s.id
  ) x;

  WITH days AS (
    SELECT generate_series(date_trunc('day', _from), date_trunc('day', _to), interval '1 day')::date AS day
  ),
  leads_scope AS (
    SELECT l.id FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
  ),
  won_lost AS (
    SELECT date_trunc('day', l.closed_at)::date AS day,
      sum(CASE WHEN l.status = 'won' THEN 1 ELSE 0 END) AS won,
      sum(CASE WHEN l.status = 'lost' THEN 1 ELSE 0 END) AS lost
    FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
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

  WITH leads_scope AS (
    SELECT l.id FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
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
    SELECT tr.from_id, sf.name AS from_name, sf.color AS from_color,
      tr.to_id, st.name AS to_name, st.color AS to_color, tr.cnt
    FROM tr
    LEFT JOIN public.pipeline_stages sf ON sf.id = tr.from_id
    LEFT JOIN public.pipeline_stages st ON st.id = tr.to_id
    WHERE tr.to_id IS NOT NULL
    LIMIT 15
  ) x;

  WITH leads_scope AS (
    SELECT l.* FROM public.leads l
    WHERE l.company_id = _scope_company
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.leads DESC), '[]'::jsonb) INTO _by_pipeline
  FROM (
    SELECT
      p.id AS pipeline_id,
      p.name,
      COUNT(l.id) AS leads,
      COUNT(l.id) FILTER (WHERE l.status = 'won' AND l.closed_at BETWEEN _from AND _to) AS won,
      COUNT(l.id) FILTER (WHERE l.status = 'lost' AND l.closed_at BETWEEN _from AND _to) AS lost,
      COALESCE(SUM(l.value) FILTER (WHERE l.status = 'won' AND l.closed_at BETWEEN _from AND _to), 0) AS revenue,
      ROUND(AVG(EXTRACT(EPOCH FROM (l.closed_at - l.created_at))/86400.0) FILTER (WHERE l.closed_at BETWEEN _from AND _to)::numeric, 2) AS avg_cycle_days
    FROM public.pipelines p
    LEFT JOIN leads_scope l ON l.pipeline_id = p.id
    WHERE p.company_id = _scope_company
    GROUP BY p.id, p.name
  ) x;

  WITH leads_scope AS (
    SELECT l.* FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.revenue DESC NULLS LAST, x.won DESC), '[]'::jsonb) INTO _by_user
  FROM (
    SELECT
      pr.id AS user_id,
      COALESCE(pr.full_name, pr.email, 'Sem responsável') AS name,
      pr.avatar_url,
      COUNT(l.id) AS leads,
      COUNT(l.id) FILTER (WHERE l.status = 'won' AND l.closed_at BETWEEN _from AND _to) AS won,
      COUNT(l.id) FILTER (WHERE l.status = 'lost' AND l.closed_at BETWEEN _from AND _to) AS lost,
      COALESCE(SUM(l.value) FILTER (WHERE l.status = 'won' AND l.closed_at BETWEEN _from AND _to), 0) AS revenue,
      ROUND(AVG(EXTRACT(EPOCH FROM (l.responded_at - l.created_at))/3600.0) FILTER (WHERE l.responded_at IS NOT NULL AND l.created_at BETWEEN _from AND _to)::numeric, 2) AS avg_response_hours,
      ROUND(AVG(l.value) FILTER (WHERE l.status = 'won' AND l.closed_at BETWEEN _from AND _to)::numeric, 2) AS avg_ticket
    FROM public.profiles pr
    LEFT JOIN leads_scope l ON l.assigned_to = pr.id
    WHERE pr.company_id = _scope_company
    GROUP BY pr.id, pr.full_name, pr.email, pr.avatar_url
    HAVING COUNT(l.id) > 0
  ) x;

  WITH leads_scope AS (
    SELECT l.* FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
      AND l.status = 'lost'
      AND l.closed_at BETWEEN _from AND _to
  ),
  agg AS (
    SELECT
      l.loss_reason_id,
      COALESCE(lr.label, l.loss_reason_text, 'Sem motivo') AS label,
      COUNT(*) AS cnt,
      COALESCE(SUM(l.value), 0) AS value_sum,
      ROUND(AVG(l.value)::numeric, 2) AS avg_value
    FROM leads_scope l
    LEFT JOIN public.loss_reasons lr ON lr.id = l.loss_reason_id
    GROUP BY 1, 2
  ),
  total AS (SELECT GREATEST(SUM(cnt), 1) AS t FROM agg)
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.cnt DESC), '[]'::jsonb) INTO _by_loss_reason
  FROM (
    SELECT a.loss_reason_id, a.label, a.cnt, a.value_sum, a.avg_value,
      ROUND((a.cnt::numeric / (SELECT t FROM total)) * 100, 1) AS pct
    FROM agg a
  ) x;

  WITH leads_scope AS (
    SELECT l.* FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
      AND l.status = 'lost'
      AND l.closed_at BETWEEN _from AND _to
  ),
  top5 AS (
    SELECT l.loss_reason_id,
      COALESCE(lr.label, l.loss_reason_text, 'Sem motivo') AS label
    FROM leads_scope l
    LEFT JOIN public.loss_reasons lr ON lr.id = l.loss_reason_id
    GROUP BY 1, 2
    ORDER BY count(*) DESC
    LIMIT 5
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.day), '[]'::jsonb) INTO _loss_reason_daily
  FROM (
    SELECT date_trunc('day', l.closed_at)::date AS day,
      t.label,
      COUNT(*) AS cnt
    FROM leads_scope l
    JOIN top5 t ON COALESCE(l.loss_reason_id::text, '_') = COALESCE(t.loss_reason_id::text, '_')
    GROUP BY 1, 2
  ) x;

  _result := jsonb_build_object(
    'kpis', _kpis,
    'stages', _stage_metrics,
    'daily', _daily,
    'transitions', _transitions,
    'by_pipeline', _by_pipeline,
    'by_user', _by_user,
    'by_loss_reason', _by_loss_reason,
    'loss_reason_daily', _loss_reason_daily
  );

  RETURN _result;
END;
$function$;