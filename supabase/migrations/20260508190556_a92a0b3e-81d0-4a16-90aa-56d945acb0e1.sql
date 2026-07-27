
-- Helper: compute the 10 comparable KPI block for a given period
CREATE OR REPLACE FUNCTION public._attendance_metrics_block(
  _cid uuid,
  _from timestamptz,
  _to timestamptz,
  _agent_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _tmr numeric := 0;
  _tma numeric := 0;
  _fcr numeric := 0;
  _csat numeric := 0;
  _closed int := 0;
  _sla numeric := 0;
  _trans numeric := 0;
  _msgs_per numeric := 0;
  _conv numeric := 0;
  _nps numeric;
  _sla_target_seconds int := 300; -- 5 min default
  _sla_eligible int := 0;
  _sla_ok int := 0;
  _msgs_total int := 0;
  _won int := 0;
BEGIN
  -- Closed tickets in period
  SELECT COUNT(*) INTO _closed
  FROM public.attendance_tickets
  WHERE company_id = _cid AND status = 'closed'
    AND closed_at IS NOT NULL
    AND closed_at >= _from AND closed_at <= _to
    AND (_agent_id IS NULL OR assigned_to = _agent_id);

  -- TMA
  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60.0), 0)
  INTO _tma
  FROM public.attendance_tickets
  WHERE company_id = _cid AND status = 'closed'
    AND closed_at IS NOT NULL
    AND closed_at >= _from AND closed_at <= _to
    AND (_agent_id IS NULL OR assigned_to = _agent_id);

  -- TMR + SLA: both from first client/human msg
  WITH ticket_msgs AS (
    SELECT
      t.id AS ticket_id,
      MIN(cm.timestamp) FILTER (WHERE cm.from_me = false AND cm.timestamp >= t.created_at) AS first_client,
      MIN(cm.timestamp) FILTER (
        WHERE cm.from_me = true
          AND COALESCE(cm.sender_name, '') NOT IN ('ai_agent','agente_ia','ia','bot')
          AND cm.timestamp >= t.created_at
      ) AS first_human
    FROM public.attendance_tickets t
    LEFT JOIN public.chat_messages cm ON cm.conversation_id = t.conversation_id
    WHERE t.company_id = _cid
      AND t.created_at >= _from AND t.created_at <= _to
      AND (_agent_id IS NULL OR t.assigned_to = _agent_id)
    GROUP BY t.id
  ), eligible AS (
    SELECT EXTRACT(EPOCH FROM (first_human - first_client)) AS resp_seconds
    FROM ticket_msgs
    WHERE first_client IS NOT NULL AND first_human IS NOT NULL AND first_human >= first_client
  )
  SELECT
    COALESCE(AVG(resp_seconds), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE resp_seconds <= _sla_target_seconds)
  INTO _tmr, _sla_eligible, _sla_ok
  FROM eligible;

  IF _sla_eligible > 0 THEN
    _sla := ROUND((_sla_ok::numeric * 100.0 / _sla_eligible::numeric), 2);
  END IF;

  -- FCR
  IF _closed > 0 THEN
    SELECT ROUND(
      (COUNT(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM public.attendance_ticket_events e
        WHERE e.ticket_id = t.id AND e.event_type = 'reopened'
      ))::numeric * 100.0 / COUNT(*)::numeric)
    , 2)
    INTO _fcr
    FROM public.attendance_tickets t
    WHERE t.company_id = _cid AND t.status = 'closed'
      AND t.closed_at IS NOT NULL
      AND t.closed_at >= _from AND t.closed_at <= _to
      AND (_agent_id IS NULL OR t.assigned_to = _agent_id);
  END IF;

  -- Transbordo
  WITH t_in_period AS (
    SELECT t.id FROM public.attendance_tickets t
    WHERE t.company_id = _cid
      AND t.created_at >= _from AND t.created_at <= _to
      AND (_agent_id IS NULL OR t.assigned_to = _agent_id)
  ),
  ap AS (
    SELECT a.ticket_id, COUNT(*) cnt
    FROM public.attendance_ticket_assignments a
    WHERE a.ticket_id IN (SELECT id FROM t_in_period)
    GROUP BY a.ticket_id
  )
  SELECT CASE WHEN (SELECT COUNT(*) FROM t_in_period) > 0
    THEN ROUND(((SELECT COUNT(*) FROM ap WHERE cnt > 1)::numeric * 100.0
      / (SELECT COUNT(*) FROM t_in_period)::numeric), 2)
    ELSE 0 END
  INTO _trans;

  -- CSAT (1-5 scale or all responded scores avg)
  SELECT COALESCE(AVG(r.score), 0)
  INTO _csat
  FROM public.attendance_ticket_ratings r
  LEFT JOIN public.attendance_tickets t ON t.id = r.ticket_id
  WHERE r.company_id = _cid AND r.status = 'responded'
    AND r.requested_at >= _from AND r.requested_at <= _to
    AND (_agent_id IS NULL OR t.assigned_to = _agent_id);

  -- NPS
  SELECT
    CASE WHEN COUNT(*) = 0 THEN NULL
    ELSE (
      (COUNT(*) FILTER (WHERE r.score >= 9))::numeric * 100.0 / COUNT(*)::numeric
      - (COUNT(*) FILTER (WHERE r.score <= 6))::numeric * 100.0 / COUNT(*)::numeric
    ) END
  INTO _nps
  FROM public.attendance_ticket_ratings r
  LEFT JOIN public.attendance_tickets t ON t.id = r.ticket_id
  WHERE r.company_id = _cid AND r.scale = 'nps' AND r.status = 'responded'
    AND r.requested_at >= _from AND r.requested_at <= _to
    AND (_agent_id IS NULL OR t.assigned_to = _agent_id);

  -- Mensagens por atendimento: total chat_messages in period / closed tickets
  SELECT COUNT(*) INTO _msgs_total
  FROM public.chat_messages cm
  WHERE cm.company_id = _cid
    AND cm.timestamp >= _from AND cm.timestamp <= _to;

  IF _closed > 0 THEN
    _msgs_per := ROUND((_msgs_total::numeric / _closed::numeric), 2);
  END IF;

  -- Taxa de conversão: leads ganhos no período / tickets encerrados
  SELECT COUNT(*) INTO _won
  FROM public.leads
  WHERE company_id = _cid AND status = 'won'
    AND closed_at IS NOT NULL
    AND closed_at >= _from AND closed_at <= _to
    AND (_agent_id IS NULL OR assigned_to = _agent_id);

  IF _closed > 0 THEN
    _conv := LEAST(ROUND((_won::numeric * 100.0 / _closed::numeric), 2), 100);
  END IF;

  RETURN jsonb_build_object(
    'tmr_seconds', ROUND(COALESCE(_tmr, 0)::numeric, 2),
    'avg_handle_minutes', ROUND(COALESCE(_tma, 0)::numeric, 2),
    'fcr_rate', COALESCE(_fcr, 0),
    'csat', ROUND(COALESCE(_csat, 0)::numeric, 2),
    'closed', _closed,
    'sla_response_rate', _sla,
    'transbordo_rate', COALESCE(_trans, 0),
    'messages_per_ticket', _msgs_per,
    'conversion_rate', _conv,
    'nps', CASE WHEN _nps IS NULL THEN NULL ELSE ROUND(_nps::numeric, 2) END
  );
END;
$$;

-- Update main RPC to include new metrics + previous-period block
CREATE OR REPLACE FUNCTION public.get_attendance_reports(
  _company_id uuid DEFAULT NULL::uuid,
  _from timestamptz DEFAULT (now() - '30 days'::interval),
  _to timestamptz DEFAULT now(),
  _agent_id uuid DEFAULT NULL::uuid
)
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

  -- by_agent: extended with TMR, SLA, CSAT, NPS, msgs/ticket, pendentes/expiradas
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
    FROM generate_series(date_trunc('day', _from), date_trunc('day', _to), interval '1 day') d
    LEFT JOIN (
      SELECT date_trunc('day', created_at) AS day, COUNT(*) AS created_count
      FROM public.attendance_tickets
      WHERE company_id = _cid AND created_at >= _from AND created_at <= _to
        AND (_agent_id IS NULL OR assigned_to = _agent_id)
      GROUP BY 1
    ) c ON c.day = d
    LEFT JOIN (
      SELECT date_trunc('day', closed_at) AS day, COUNT(*) AS closed_count
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
