-- Garante que buckets diários e ranges relativos das RPCs usem America/Sao_Paulo,
-- alinhando o backend ao frontend (que envia limites já calculados em SP).

CREATE OR REPLACE FUNCTION public.get_attendance_reports(_company_id uuid DEFAULT NULL::uuid, _from timestamp with time zone DEFAULT (now() - '30 days'::interval), _to timestamp with time zone DEFAULT now(), _agent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cid uuid;
  _result jsonb;
  _totals jsonb;
  _by_agent jsonb;
  _ratings jsonb;
  _score_dist jsonb;
  _daily jsonb;
  _transfers int;
  _avg_score numeric;
  _total_req int;
  _responded int;
  _expired int;
  _pending int;
  _active_now int;
  _waiting_now int;
  _top_categories jsonb;
  _current jsonb;
  _previous jsonb;
  _prev_from timestamptz;
  _prev_to timestamptz;
  _delta interval;
BEGIN
  IF public.is_master(auth.uid()) THEN
    _cid := COALESCE(_company_id, public.get_user_company_id(auth.uid()));
  ELSE
    _cid := public.get_user_company_id(auth.uid());
    IF NOT public.is_company_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    IF _company_id IS NOT NULL AND _company_id <> _cid THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF _cid IS NULL THEN
    RAISE EXCEPTION 'No company';
  END IF;

  _delta := _to - _from;
  _prev_to := _from - interval '1 millisecond';
  _prev_from := _prev_to - _delta;

  _current := public._attendance_metrics_block(_cid, _from, _to, _agent_id);
  _previous := public._attendance_metrics_block(_cid, _prev_from, _prev_to, _agent_id);

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'open', COUNT(*) FILTER (WHERE status = 'open'),
    'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress'),
    'reopened', COUNT(*) FILTER (WHERE status = 'reopened'),
    'closed', COUNT(*) FILTER (WHERE status = 'closed')
  )
  INTO _totals
  FROM public.attendance_tickets
  WHERE company_id = _cid AND created_at >= _from AND created_at <= _to
    AND (_agent_id IS NULL OR assigned_to = _agent_id);

  SELECT COUNT(*) INTO _transfers
  FROM public.attendance_ticket_assignments
  WHERE company_id = _cid AND mode = 'transfer'
    AND created_at >= _from AND created_at <= _to
    AND (_agent_id IS NULL OR to_user_id = _agent_id OR from_user_id = _agent_id);

  SELECT
    COUNT(*) FILTER (WHERE status IN ('open','in_progress','reopened') AND assigned_to IS NOT NULL),
    COUNT(*) FILTER (WHERE status IN ('open','in_progress','reopened') AND assigned_to IS NULL)
  INTO _active_now, _waiting_now
  FROM public.attendance_tickets
  WHERE company_id = _cid;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::int DESC), '[]'::jsonb) INTO _top_categories
  FROM (
    SELECT jsonb_build_object(
      'category', COALESCE(NULLIF(category, ''), 'Sem categoria'),
      'count', COUNT(*)
    ) AS row
    FROM public.attendance_tickets
    WHERE company_id = _cid
      AND created_at >= _from AND created_at <= _to
      AND (_agent_id IS NULL OR assigned_to = _agent_id)
    GROUP BY COALESCE(NULLIF(category, ''), 'Sem categoria')
    LIMIT 10
  ) tc;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'total')::int DESC), '[]'::jsonb) INTO _by_agent
  FROM (
    SELECT jsonb_build_object(
      'user_id', p.id,
      'name', COALESCE(p.full_name, p.email),
      'avatar_url', p.avatar_url,
      'total', COALESCE(stats.total, 0),
      'open', COALESCE(stats.open, 0),
      'closed', COALESCE(stats.closed, 0),
      'avg_handle_min', COALESCE(stats.avg_handle, 0),
      'tmr_seconds', COALESCE(tmr.tmr_seconds, 0),
      'sla_rate', COALESCE(tmr.sla_rate, 0),
      'csat', COALESCE(rating_stats.csat, 0),
      'nps', rating_stats.nps,
      'msgs_per_ticket', COALESCE(stats.msgs_per, 0),
      'pending_ratings', COALESCE(rating_stats.pending, 0),
      'expired_ratings', COALESCE(rating_stats.expired, 0)
    ) AS row
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT
        COUNT(t.id) AS total,
        COUNT(t.id) FILTER (WHERE t.status IN ('open','in_progress','reopened')) AS open,
        COUNT(t.id) FILTER (WHERE t.status = 'closed') AS closed,
        AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at))/60.0)
          FILTER (WHERE t.status='closed' AND t.closed_at IS NOT NULL) AS avg_handle,
        CASE WHEN COUNT(t.id) FILTER (WHERE t.status='closed') > 0
          THEN ROUND((SELECT COUNT(*) FROM public.chat_messages cm
                      WHERE cm.company_id=_cid AND cm.timestamp >= _from AND cm.timestamp <= _to
                        AND cm.conversation_id IN (
                          SELECT t2.conversation_id FROM public.attendance_tickets t2
                          WHERE t2.assigned_to=p.id AND t2.company_id=_cid
                            AND t2.created_at >= _from AND t2.created_at <= _to))::numeric
                      / NULLIF(COUNT(t.id) FILTER (WHERE t.status='closed'),0)::numeric, 2)
          ELSE 0 END AS msgs_per
      FROM public.attendance_tickets t
      WHERE t.assigned_to = p.id AND t.company_id = _cid
        AND t.created_at >= _from AND t.created_at <= _to
    ) stats ON true
    LEFT JOIN LATERAL (
      WITH tm AS (
        SELECT t.id,
          MIN(cm.timestamp) FILTER (WHERE cm.from_me = false AND cm.timestamp >= t.created_at) AS fc,
          MIN(cm.timestamp) FILTER (
            WHERE cm.from_me = true
              AND COALESCE(cm.sender_name,'') NOT IN ('ai_agent','agente_ia','ia','bot')
              AND cm.timestamp >= t.created_at
          ) AS fh
        FROM public.attendance_tickets t
        LEFT JOIN public.chat_messages cm ON cm.conversation_id = t.conversation_id
        WHERE t.assigned_to = p.id AND t.company_id = _cid
          AND t.created_at >= _from AND t.created_at <= _to
        GROUP BY t.id
      ), elig AS (
        SELECT EXTRACT(EPOCH FROM (fh - fc)) AS s
        FROM tm WHERE fc IS NOT NULL AND fh IS NOT NULL AND fh >= fc
      )
      SELECT
        COALESCE(AVG(s), 0) AS tmr_seconds,
        CASE WHEN COUNT(*) > 0
          THEN ROUND((COUNT(*) FILTER (WHERE s <= 300)::numeric * 100.0 / COUNT(*)::numeric), 2)
          ELSE 0 END AS sla_rate
      FROM elig
    ) tmr ON true
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(AVG(r.score) FILTER (WHERE r.status='responded'), 0) AS csat,
        CASE WHEN COUNT(*) FILTER (WHERE r.scale='nps' AND r.status='responded') = 0 THEN NULL
          ELSE ROUND((
            (COUNT(*) FILTER (WHERE r.scale='nps' AND r.status='responded' AND r.score>=9))::numeric*100.0
              / NULLIF(COUNT(*) FILTER (WHERE r.scale='nps' AND r.status='responded'),0)::numeric
            - (COUNT(*) FILTER (WHERE r.scale='nps' AND r.status='responded' AND r.score<=6))::numeric*100.0
              / NULLIF(COUNT(*) FILTER (WHERE r.scale='nps' AND r.status='responded'),0)::numeric
          )::numeric, 2) END AS nps,
        COUNT(*) FILTER (WHERE r.status='pending') AS pending,
        COUNT(*) FILTER (WHERE r.status='expired') AS expired
      FROM public.attendance_ticket_ratings r
      JOIN public.attendance_tickets t ON t.id = r.ticket_id
      WHERE r.company_id = _cid AND t.assigned_to = p.id
        AND r.requested_at >= _from AND r.requested_at <= _to
    ) rating_stats ON true
    WHERE p.company_id = _cid AND p.is_active = true
  ) sub;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE r.status = 'responded'),
    COUNT(*) FILTER (WHERE r.status = 'expired'),
    COUNT(*) FILTER (WHERE r.status = 'pending'),
    COALESCE(AVG(r.score) FILTER (WHERE r.status = 'responded'), 0)
  INTO _total_req, _responded, _expired, _pending, _avg_score
  FROM public.attendance_ticket_ratings r
  LEFT JOIN public.attendance_tickets t ON t.id = r.ticket_id
  WHERE r.company_id = _cid AND r.requested_at >= _from AND r.requested_at <= _to
    AND (_agent_id IS NULL OR t.assigned_to = _agent_id);

  _ratings := jsonb_build_object(
    'total_requested', _total_req,
    'responded', _responded,
    'expired', _expired,
    'pending', _pending,
    'response_rate', CASE WHEN _total_req > 0 THEN ROUND((_responded::numeric * 100 / _total_req)::numeric, 2) ELSE 0 END,
    'expire_rate', CASE WHEN _total_req > 0 THEN ROUND((_expired::numeric * 100 / _total_req)::numeric, 2) ELSE 0 END,
    'avg_score', ROUND(COALESCE(_avg_score, 0)::numeric, 2),
    'nps', _current->'nps'
  );

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'score')::numeric), '[]'::jsonb) INTO _score_dist
  FROM (
    SELECT jsonb_build_object('score', r.score, 'count', COUNT(*)) AS row
    FROM public.attendance_ticket_ratings r
    LEFT JOIN public.attendance_tickets t ON t.id = r.ticket_id
    WHERE r.company_id = _cid AND r.status = 'responded' AND r.score IS NOT NULL
      AND r.requested_at >= _from AND r.requested_at <= _to
      AND (_agent_id IS NULL OR t.assigned_to = _agent_id)
    GROUP BY r.score
  ) s;

  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'day')), '[]'::jsonb) INTO _daily
  FROM (
    SELECT jsonb_build_object(
      'day', to_char(d, 'YYYY-MM-DD'),
      'created', COALESCE(c.created_count, 0),
      'closed', COALESCE(cl.closed_count, 0)
    ) AS row
    FROM generate_series(date_trunc('day', _from AT TIME ZONE 'America/Sao_Paulo'), date_trunc('day', _to AT TIME ZONE 'America/Sao_Paulo'), interval '1 day') d
    LEFT JOIN (
      SELECT date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo') AS day, COUNT(*) AS created_count
      FROM public.attendance_tickets
      WHERE company_id = _cid AND created_at >= _from AND created_at <= _to
        AND (_agent_id IS NULL OR assigned_to = _agent_id)
      GROUP BY 1
    ) c ON c.day = d
    LEFT JOIN (
      SELECT date_trunc('day', closed_at AT TIME ZONE 'America/Sao_Paulo') AS day, COUNT(*) AS closed_count
      FROM public.attendance_tickets
      WHERE company_id = _cid AND closed_at IS NOT NULL
        AND closed_at >= _from AND closed_at <= _to
        AND (_agent_id IS NULL OR assigned_to = _agent_id)
      GROUP BY 1
    ) cl ON cl.day = d
  ) ds;

  _result := jsonb_build_object(
    'company_id', _cid,
    'from', _from,
    'to', _to,
    'totals', _totals,
    'avg_handle_minutes', _current->'avg_handle_minutes',
    'transfers', _transfers,
    'by_agent', _by_agent,
    'ratings', _ratings,
    'score_distribution', _score_dist,
    'daily', _daily,
    'tmr_seconds', _current->'tmr_seconds',
    'fcr_rate', _current->'fcr_rate',
    'transbordo_rate', _current->'transbordo_rate',
    'sla_response_rate', _current->'sla_response_rate',
    'messages_per_ticket', _current->'messages_per_ticket',
    'conversion_rate', _current->'conversion_rate',
    'active_now', COALESCE(_active_now, 0),
    'waiting_now', COALESCE(_waiting_now, 0),
    'top_categories', _top_categories,
    'previous', _previous
  );

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_pipeline_performance_report(_company_id uuid, _from timestamp with time zone, _to timestamp with time zone, _pipeline_id uuid DEFAULT NULL::uuid)
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

  WITH days AS (
    SELECT generate_series(date_trunc('day', _from AT TIME ZONE 'America/Sao_Paulo'), date_trunc('day', _to AT TIME ZONE 'America/Sao_Paulo'), interval '1 day')::date AS day
  ),
  leads_scope AS (
    SELECT l.id FROM public.leads l
    WHERE l.company_id = _scope_company
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
  ),
  won_lost AS (
    SELECT ((l.closed_at AT TIME ZONE 'America/Sao_Paulo'))::date AS day,
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
    SELECT ((lh.created_at AT TIME ZONE 'America/Sao_Paulo'))::date AS day, count(*) AS reopened
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
$function$;

CREATE OR REPLACE FUNCTION public.get_pipeline_performance_report(_company_id uuid, _from timestamp with time zone, _to timestamp with time zone, _pipeline_id uuid DEFAULT NULL::uuid, _user_id uuid DEFAULT NULL::uuid, _status text DEFAULT NULL::text, _loss_reason_id uuid DEFAULT NULL::uuid)
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
    SELECT l.*, s.stage_type::text AS stage_type_norm
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (
        (_unassigned IS TRUE AND l.assigned_to IS NULL)
        OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter))
      )
      AND (_loss_reason_id IS NULL OR l.loss_reason_id = _loss_reason_id)
      AND (
        _status_norm IS NULL OR _status_norm IN ('all','')
        OR (_status_norm = 'open' AND NOT public.lead_is_closed(l.status, s.stage_type::text))
        OR (_status_norm = 'won' AND public.lead_is_won(l.status, s.stage_type::text))
        OR (_status_norm = 'lost' AND public.lead_is_lost(l.status, s.stage_type::text))
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
    'won', (SELECT count(*) FROM closed WHERE public.lead_is_won(status, stage_type_norm)),
    'lost', (SELECT count(*) FROM closed WHERE public.lead_is_lost(status, stage_type_norm)),
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
    'revenue_won', COALESCE((SELECT SUM(public.lead_realized_value(value,net_value)) FROM closed WHERE public.lead_is_won(status, stage_type_norm)), 0),
    'revenue_lost', COALESCE((SELECT SUM(public.lead_realized_value(value,net_value)) FROM closed WHERE public.lead_is_lost(status, stage_type_norm)), 0),
    'avg_ticket_won', (
      SELECT ROUND(AVG(public.lead_realized_value(value,net_value))::numeric, 2) FROM closed WHERE public.lead_is_won(status, stage_type_norm)
    ),
    'pipeline_value', COALESCE((SELECT SUM(public.lead_realized_value(value,net_value)) FROM in_period), 0),
    'avg_ticket_all', (
      SELECT ROUND(AVG(public.lead_realized_value(value,net_value))::numeric, 2) FROM in_period
    )
  ) INTO _kpis;

  WITH leads_scope AS (
    SELECT l.id, l.stage_id, l.pipeline_id
    FROM public.leads l
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
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
    SELECT generate_series(date_trunc('day', _from AT TIME ZONE 'America/Sao_Paulo'), date_trunc('day', _to AT TIME ZONE 'America/Sao_Paulo'), interval '1 day')::date AS day
  ),
  leads_scope AS (
    SELECT l.id FROM public.leads l
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
  ),
  won_lost AS (
    SELECT ((l.closed_at AT TIME ZONE 'America/Sao_Paulo'))::date AS day,
      sum(CASE WHEN public.lead_is_won(l.status, s.stage_type::text) THEN 1 ELSE 0 END) AS won,
      sum(CASE WHEN public.lead_is_lost(l.status, s.stage_type::text) THEN 1 ELSE 0 END) AS lost
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
      AND l.closed_at IS NOT NULL
      AND l.closed_at >= _from AND l.closed_at <= _to
    GROUP BY 1
  ),
  reopens AS (
    SELECT ((lh.created_at AT TIME ZONE 'America/Sao_Paulo'))::date AS day, count(*) AS reopened
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
      AND COALESCE(l.is_demo,false) = false
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
    SELECT l.*, s.stage_type::text AS stage_type_norm
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.leads DESC), '[]'::jsonb) INTO _by_pipeline
  FROM (
    SELECT
      p.id AS pipeline_id,
      p.name,
      COUNT(l.id) AS leads,
      COUNT(l.id) FILTER (WHERE public.lead_is_won(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to) AS won,
      COUNT(l.id) FILTER (WHERE public.lead_is_lost(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to) AS lost,
      COALESCE(SUM(public.lead_realized_value(l.value,l.net_value)) FILTER (WHERE public.lead_is_won(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to), 0) AS revenue,
      ROUND(AVG(EXTRACT(EPOCH FROM (l.closed_at - l.created_at))/86400.0) FILTER (WHERE l.closed_at BETWEEN _from AND _to)::numeric, 2) AS avg_cycle_days
    FROM public.pipelines p
    LEFT JOIN leads_scope l ON l.pipeline_id = p.id
    WHERE p.company_id = _scope_company
    GROUP BY p.id, p.name
  ) x;

  WITH leads_scope AS (
    SELECT l.*, s.stage_type::text AS stage_type_norm
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.revenue DESC NULLS LAST, x.won DESC), '[]'::jsonb) INTO _by_user
  FROM (
    SELECT
      pr.id AS user_id,
      COALESCE(pr.full_name, pr.email, 'Sem responsável') AS name,
      pr.avatar_url,
      COUNT(l.id) AS leads,
      COUNT(l.id) FILTER (WHERE public.lead_is_won(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to) AS won,
      COUNT(l.id) FILTER (WHERE public.lead_is_lost(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to) AS lost,
      COALESCE(SUM(public.lead_realized_value(l.value,l.net_value)) FILTER (WHERE public.lead_is_won(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to), 0) AS revenue,
      ROUND(AVG(EXTRACT(EPOCH FROM (l.responded_at - l.created_at))/3600.0) FILTER (WHERE l.responded_at IS NOT NULL AND l.created_at BETWEEN _from AND _to)::numeric, 2) AS avg_response_hours,
      ROUND(AVG(public.lead_realized_value(l.value,l.net_value)) FILTER (WHERE public.lead_is_won(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to)::numeric, 2) AS avg_ticket
    FROM public.profiles pr
    LEFT JOIN leads_scope l ON l.assigned_to = pr.id
    WHERE pr.company_id = _scope_company
    GROUP BY pr.id, pr.full_name, pr.email, pr.avatar_url
    HAVING COUNT(l.id) > 0
  ) x;

  WITH leads_scope AS (
    SELECT l.*, s.stage_type::text AS stage_type_norm
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
      AND public.lead_is_lost(l.status, s.stage_type::text)
      AND l.closed_at BETWEEN _from AND _to
  ),
  agg AS (
    SELECT
      l.loss_reason_id,
      COALESCE(lr.label, l.loss_reason_text, 'Sem motivo') AS label,
      COUNT(*) AS cnt,
      COALESCE(SUM(public.lead_realized_value(l.value,l.net_value)), 0) AS value_sum,
      ROUND(AVG(public.lead_realized_value(l.value,l.net_value))::numeric, 2) AS avg_value
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
    SELECT l.*, s.stage_type::text AS stage_type_norm
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
      AND public.lead_is_lost(l.status, s.stage_type::text)
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
    SELECT ((l.closed_at AT TIME ZONE 'America/Sao_Paulo'))::date AS day,
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

CREATE OR REPLACE FUNCTION public.get_master_ai_overview(_from timestamp with time zone, _to timestamp with time zone, _prev_from timestamp with time zone, _prev_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb;
  _kpis jsonb;
  _series jsonb;
  _top jsonb;
  _blocked jsonb;
  _models jsonb;
  _kb jsonb;
  _opportunities jsonb;
  _addons_active int;
  _addons_active_prev int;
  _mrr_addon numeric;
  _msgs int; _msgs_prev int;
  _cost numeric; _cost_prev numeric;
  _runs int; _runs_prev int;
  _qualified int; _transferred int; _audios int; _errors int;
  _avg_latency numeric;
BEGIN
  IF NOT is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(monthly_price), 0)
    INTO _addons_active, _mrr_addon
  FROM company_addons
  WHERE addon_slug = 'ai_agent' AND is_active = true;

  SELECT COUNT(*) INTO _addons_active_prev
  FROM company_addons
  WHERE addon_slug = 'ai_agent'
    AND activated_at <= _prev_to
    AND (deactivated_at IS NULL OR deactivated_at > _prev_to);

  SELECT
    COALESCE(SUM(messages_consumed), 0),
    COALESCE(SUM(cost_brl), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE tools_called::text ILIKE '%qualify_lead%'),
    COUNT(*) FILTER (WHERE tools_called::text ILIKE '%transfer_to_human%'),
    COUNT(*) FILTER (WHERE had_audio = true),
    COUNT(*) FILTER (WHERE status = 'error'),
    COALESCE(AVG(latency_ms), 0)
  INTO _msgs, _cost, _runs, _qualified, _transferred, _audios, _errors, _avg_latency
  FROM ai_agent_runs
  WHERE created_at >= _from AND created_at <= _to;

  SELECT
    COALESCE(SUM(messages_consumed), 0),
    COALESCE(SUM(cost_brl), 0),
    COUNT(*)
  INTO _msgs_prev, _cost_prev, _runs_prev
  FROM ai_agent_runs
  WHERE created_at >= _prev_from AND created_at <= _prev_to;

  _kpis := jsonb_build_object(
    'addonsActive', _addons_active,
    'addonsActivePrev', _addons_active_prev,
    'mrrAddon', _mrr_addon,
    'messages', _msgs,
    'messagesPrev', _msgs_prev,
    'cost', ROUND(_cost, 4),
    'costPrev', ROUND(_cost_prev, 4),
    'runs', _runs,
    'runsPrev', _runs_prev,
    'qualified', _qualified,
    'transferred', _transferred,
    'audios', _audios,
    'errors', _errors,
    'avgLatencyMs', ROUND(_avg_latency, 0),
    'qualificationRate', CASE WHEN _runs > 0 THEN ROUND((_qualified::numeric / _runs) * 100, 1) ELSE 0 END,
    'handoffRate', CASE WHEN _runs > 0 THEN ROUND((_transferred::numeric / _runs) * 100, 1) ELSE 0 END,
    'errorRate', CASE WHEN _runs > 0 THEN ROUND((_errors::numeric / _runs) * 100, 1) ELSE 0 END
  );

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) INTO _series
  FROM (
    SELECT
      date_trunc('day', created_at AT TIME ZONE 'America/Sao_Paulo') AS day,
      COUNT(*) AS runs,
      COALESCE(SUM(messages_consumed), 0) AS messages,
      ROUND(COALESCE(SUM(cost_brl), 0), 4) AS cost,
      COUNT(*) FILTER (WHERE status = 'error') AS errors
    FROM ai_agent_runs
    WHERE created_at >= _from AND created_at <= _to
    GROUP BY 1
    ORDER BY 1
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _top
  FROM (
    SELECT
      c.id, c.name, c.logo_url, c.plan_status,
      COALESCE(r.runs, 0) AS runs,
      COALESCE(r.messages, 0) AS messages,
      COALESCE(r.cost, 0) AS cost,
      COALESCE(r.qualified, 0) AS qualified,
      COALESCE(r.transferred, 0) AS transferred,
      COALESCE(r.avg_latency, 0) AS avg_latency_ms,
      COALESCE(a.is_active, false) AS addon_active,
      COALESCE(a.included_messages, 0) AS included,
      COALESCE(a.overage_price_per_message, 0) AS overage_price,
      COALESCE(a.monthly_price, 0) AS monthly_price,
      COALESCE(l.currently_blocked, false) AS blocked,
      l.blocked_reason,
      GREATEST(0, COALESCE(r.messages, 0) - COALESCE(a.included_messages, 0)) AS overage,
      ROUND(
        COALESCE(a.monthly_price, 0)
        + GREATEST(0, COALESCE(r.messages, 0) - COALESCE(a.included_messages, 0))
          * COALESCE(a.overage_price_per_message, 0)
      , 2) AS projected_invoice
    FROM companies c
    LEFT JOIN (
      SELECT company_id,
             COUNT(*) AS runs,
             SUM(messages_consumed) AS messages,
             ROUND(SUM(cost_brl), 4) AS cost,
             COUNT(*) FILTER (WHERE tools_called::text ILIKE '%qualify_lead%') AS qualified,
             COUNT(*) FILTER (WHERE tools_called::text ILIKE '%transfer_to_human%') AS transferred,
             ROUND(AVG(latency_ms), 0) AS avg_latency
      FROM ai_agent_runs
      WHERE created_at >= _from AND created_at <= _to
      GROUP BY company_id
    ) r ON r.company_id = c.id
    LEFT JOIN company_addons a
      ON a.company_id = c.id AND a.addon_slug = 'ai_agent' AND a.is_active = true
    LEFT JOIN ai_agent_limits l ON l.company_id = c.id
    WHERE COALESCE(r.runs, 0) > 0 OR a.is_active = true
    ORDER BY COALESCE(r.messages, 0) DESC, COALESCE(a.is_active, false) DESC
    LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _blocked
  FROM (
    SELECT c.id, c.name, l.blocked_reason, l.blocked_at, l.blocked_until
    FROM ai_agent_limits l
    JOIN companies c ON c.id = l.company_id
    WHERE l.currently_blocked = true
    ORDER BY l.blocked_at DESC NULLS LAST
    LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.runs DESC), '[]'::jsonb) INTO _models
  FROM (
    SELECT COALESCE(model, 'unknown') AS model, COUNT(*) AS runs
    FROM ai_agent_runs
    WHERE created_at >= _from AND created_at <= _to
    GROUP BY 1
  ) t;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'ready', COUNT(*) FILTER (WHERE status = 'ready'),
    'processing', COUNT(*) FILTER (WHERE status IN ('processing', 'pending')),
    'errors', COUNT(*) FILTER (WHERE status = 'error'),
    'sizeMb', ROUND(COALESCE(SUM(size_bytes), 0) / 1048576.0, 2),
    'companiesWithKb', COUNT(DISTINCT company_id)
  ) INTO _kb
  FROM ai_knowledge_documents;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _opportunities
  FROM (
    SELECT c.id, c.name, c.plan_status,
           m.msg_count AS human_messages
    FROM companies c
    LEFT JOIN company_addons a
      ON a.company_id = c.id AND a.addon_slug = 'ai_agent' AND a.is_active = true
    JOIN (
      SELECT company_id, COUNT(*) AS msg_count
      FROM chat_messages
      WHERE created_at >= _from AND created_at <= _to
      GROUP BY company_id
      HAVING COUNT(*) >= 100
    ) m ON m.company_id = c.id
    WHERE a.id IS NULL
      AND c.plan_status IN ('active','trial')
    ORDER BY m.msg_count DESC
    LIMIT 10
  ) t;

  _result := jsonb_build_object(
    'kpis', _kpis,
    'series', _series,
    'topCompanies', _top,
    'blocked', _blocked,
    'models', _models,
    'kb', _kb,
    'opportunities', _opportunities,
    'period', jsonb_build_object('from', _from, 'to', _to)
  );

  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_medical_dashboard_series(p_practice_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_doctor_id uuid DEFAULT NULL::uuid, p_procedure_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_daily jsonb;
  v_top_procedures jsonb;
  v_doctor_performance jsonb;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.medical_practices
  WHERE id = p_practice_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não encontrada' USING ERRCODE = '42704';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'master')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = v_company_id
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado à clínica' USING ERRCODE = '42501';
  END IF;

  WITH days AS (
    SELECT generate_series(
      ((p_from AT TIME ZONE 'America/Sao_Paulo'))::date,
      ((p_to AT TIME ZONE 'America/Sao_Paulo'))::date,
      interval '1 day'
    )::date AS day
  ),
  pay AS (
    SELECT
      received_date::date AS day,
      sum(amount) AS revenue
    FROM public.medical_payments
    WHERE practice_id = p_practice_id
      AND payment_status = 'received'
      AND received_date BETWEEN p_from AND p_to
      AND (p_doctor_id IS NULL OR doctor_id = p_doctor_id)
    GROUP BY 1
  ),
  appt AS (
    SELECT
      scheduled_date::date AS day,
      count(*) FILTER (WHERE status NOT IN ('cancelled','rescheduled')) AS total,
      count(*) FILTER (WHERE status = 'completed') AS completed,
      count(*) FILTER (WHERE status = 'no_show') AS no_show,
      count(*) FILTER (WHERE status = 'cancelled') AS cancelled
    FROM public.medical_appointments
    WHERE practice_id = p_practice_id
      AND scheduled_date BETWEEN p_from AND p_to
      AND (p_doctor_id IS NULL OR doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR procedure_id = p_procedure_id)
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(d.day, 'YYYY-MM-DD'),
    'revenue', COALESCE(pay.revenue, 0),
    'total', COALESCE(appt.total, 0),
    'completed', COALESCE(appt.completed, 0),
    'no_show', COALESCE(appt.no_show, 0),
    'cancelled', COALESCE(appt.cancelled, 0)
  ) ORDER BY d.day)
  INTO v_daily
  FROM days d
  LEFT JOIN pay ON pay.day = d.day
  LEFT JOIN appt ON appt.day = d.day;

  SELECT jsonb_agg(t) INTO v_top_procedures
  FROM (
    SELECT
      mp.id,
      mp.name,
      count(ma.id) AS count,
      COALESCE(sum(ma.price) FILTER (WHERE ma.status = 'completed'), 0) AS revenue
    FROM public.medical_appointments ma
    JOIN public.medical_procedures mp ON mp.id = ma.procedure_id
    WHERE ma.practice_id = p_practice_id
      AND ma.scheduled_date BETWEEN p_from AND p_to
      AND ma.status = 'completed'
      AND (p_doctor_id IS NULL OR ma.doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR ma.procedure_id = p_procedure_id)
    GROUP BY mp.id, mp.name
    ORDER BY count DESC
    LIMIT 10
  ) t;

  SELECT jsonb_agg(t) INTO v_doctor_performance
  FROM (
    SELECT
      md.id,
      md.full_name AS name,
      count(ma.id) FILTER (WHERE ma.status = 'completed') AS appointments,
      count(ma.id) FILTER (WHERE ma.status = 'no_show') AS no_shows,
      COALESCE(sum(ma.price) FILTER (WHERE ma.status = 'completed'), 0) AS revenue
    FROM public.medical_doctors md
    LEFT JOIN public.medical_appointments ma
      ON ma.doctor_id = md.id
     AND ma.scheduled_date BETWEEN p_from AND p_to
     AND (p_procedure_id IS NULL OR ma.procedure_id = p_procedure_id)
    WHERE md.practice_id = p_practice_id
      AND md.active = true
      AND (p_doctor_id IS NULL OR md.id = p_doctor_id)
    GROUP BY md.id, md.full_name
    ORDER BY revenue DESC NULLS LAST
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'daily', COALESCE(v_daily, '[]'::jsonb),
    'top_procedures', COALESCE(v_top_procedures, '[]'::jsonb),
    'doctor_performance', COALESCE(v_doctor_performance, '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_attendance_messages_by_hour(_company_id uuid DEFAULT NULL::uuid, _range text DEFAULT '7d'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _cid uuid;
  _from timestamptz;
  _to timestamptz := now();
  _today_sp timestamptz;
  _result jsonb;
BEGIN
  IF public.is_master(auth.uid()) THEN
    _cid := COALESCE(_company_id, public.get_user_company_id(auth.uid()));
  ELSE
    _cid := public.get_user_company_id(auth.uid());
    IF NOT public.is_company_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    IF _company_id IS NOT NULL AND _company_id <> _cid THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  IF _cid IS NULL THEN
    RAISE EXCEPTION 'No company';
  END IF;

  _today_sp := (date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo'))) AT TIME ZONE 'America/Sao_Paulo';

  _from := CASE _range
    WHEN 'today' THEN _today_sp
    WHEN '30d'   THEN _today_sp - interval '29 days'
    ELSE              _today_sp - interval '6 days'
  END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'hour', h,
    'inbound', COALESCE(inbound, 0),
    'outbound', COALESCE(outbound, 0),
    'total', COALESCE(inbound, 0) + COALESCE(outbound, 0)
  ) ORDER BY h), '[]'::jsonb)
  INTO _result
  FROM (
    SELECT generate_series(0, 23) AS h
  ) hours
  LEFT JOIN (
    SELECT
      EXTRACT(HOUR FROM (timestamp AT TIME ZONE 'America/Sao_Paulo'))::int AS hr,
      COUNT(*) FILTER (WHERE from_me = false) AS inbound,
      COUNT(*) FILTER (WHERE from_me = true) AS outbound
    FROM public.chat_messages
    WHERE company_id = _cid
      AND timestamp >= _from
      AND timestamp <= _to
    GROUP BY 1
  ) m ON m.hr = hours.h;

  RETURN jsonb_build_object(
    'range', _range,
    'from', _from,
    'to', _to,
    'by_hour', _result
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_company_growth(_company_id uuid, _days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_series jsonb;
  v_start timestamptz;
  v_today_sp timestamptz;
begin
  if not public.has_role(auth.uid(), 'master'::public.app_role) then
    raise exception 'forbidden';
  end if;

  if _days is null or _days <= 0 then _days := 30; end if;
  if _days > 180 then _days := 180; end if;

  v_today_sp := (date_trunc('day', (now() AT TIME ZONE 'America/Sao_Paulo'))) AT TIME ZONE 'America/Sao_Paulo';
  v_start := v_today_sp - make_interval(days => _days - 1);

  with days as (
    select generate_series(
      (v_start AT TIME ZONE 'America/Sao_Paulo')::date,
      (v_today_sp AT TIME ZONE 'America/Sao_Paulo')::date,
      interval '1 day'
    )::date as d
  ),
  l as (
    select (created_at AT TIME ZONE 'America/Sao_Paulo')::date as d, count(*) as c
    from public.leads
    where company_id = _company_id and created_at >= v_start
    group by 1
  ),
  m as (
    select (created_at AT TIME ZONE 'America/Sao_Paulo')::date as d, count(*) as c
    from public.messages
    where company_id = _company_id and created_at >= v_start
    group by 1
  ),
  o as (
    select (created_at AT TIME ZONE 'America/Sao_Paulo')::date as d, count(*) as c
    from public.store_orders
    where company_id = _company_id and created_at >= v_start
    group by 1
  )
  select jsonb_agg(
    jsonb_build_object(
      'date', to_char(days.d, 'YYYY-MM-DD'),
      'leads', coalesce(l.c, 0),
      'messages', coalesce(m.c, 0),
      'orders', coalesce(o.c, 0)
    ) order by days.d
  ) into v_series
  from days
  left join l on l.d = days.d
  left join m on m.d = days.d
  left join o on o.d = days.d;

  return jsonb_build_object(
    'company_id', _company_id,
    'days', _days,
    'series', coalesce(v_series, '[]'::jsonb),
    'generated_at', now()
  );
end;
$function$;
