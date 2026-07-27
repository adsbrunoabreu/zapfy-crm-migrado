
DROP FUNCTION IF EXISTS public.get_attendance_reports(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_attendance_reports(
  _company_id uuid DEFAULT NULL,
  _from timestamptz DEFAULT (now() - interval '30 days'),
  _to timestamptz DEFAULT now(),
  _agent_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid uuid;
  _result jsonb;
  _totals jsonb;
  _by_agent jsonb;
  _ratings jsonb;
  _score_dist jsonb;
  _daily jsonb;
  _avg_handle_min numeric;
  _transfers int;
  _nps numeric;
  _avg_score numeric;
  _total_req int;
  _responded int;
  _expired int;
  _pending int;
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

  SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 60.0), 0)
  INTO _avg_handle_min
  FROM public.attendance_tickets
  WHERE company_id = _cid AND status = 'closed'
    AND closed_at IS NOT NULL
    AND closed_at >= _from AND closed_at <= _to
    AND (_agent_id IS NULL OR assigned_to = _agent_id);

  SELECT COUNT(*) INTO _transfers
  FROM public.attendance_ticket_assignments
  WHERE company_id = _cid AND mode = 'transfer'
    AND created_at >= _from AND created_at <= _to
    AND (_agent_id IS NULL OR to_user_id = _agent_id OR from_user_id = _agent_id);

  -- Por agente (ignora filtro de agente para servir como comparativo)
  SELECT COALESCE(jsonb_agg(row), '[]'::jsonb) INTO _by_agent
  FROM (
    SELECT jsonb_build_object(
      'user_id', p.id,
      'name', COALESCE(p.full_name, p.email),
      'avatar_url', p.avatar_url,
      'total', COUNT(t.id),
      'open', COUNT(t.id) FILTER (WHERE t.status IN ('open','in_progress','reopened')),
      'closed', COUNT(t.id) FILTER (WHERE t.status = 'closed'),
      'avg_handle_min', COALESCE(AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at))/60.0)
        FILTER (WHERE t.status = 'closed' AND t.closed_at IS NOT NULL), 0)
    ) AS row
    FROM public.profiles p
    LEFT JOIN public.attendance_tickets t
      ON t.assigned_to = p.id
      AND t.company_id = _cid
      AND t.created_at >= _from AND t.created_at <= _to
    WHERE p.company_id = _cid AND p.is_active = true
    GROUP BY p.id, p.full_name, p.email, p.avatar_url
    ORDER BY COUNT(t.id) DESC
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

  _ratings := jsonb_build_object(
    'total_requested', _total_req,
    'responded', _responded,
    'expired', _expired,
    'pending', _pending,
    'response_rate', CASE WHEN _total_req > 0 THEN ROUND((_responded::numeric * 100 / _total_req)::numeric, 2) ELSE 0 END,
    'expire_rate', CASE WHEN _total_req > 0 THEN ROUND((_expired::numeric * 100 / _total_req)::numeric, 2) ELSE 0 END,
    'avg_score', ROUND(COALESCE(_avg_score, 0)::numeric, 2),
    'nps', CASE WHEN _nps IS NULL THEN NULL ELSE ROUND(_nps::numeric, 2) END
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
    'avg_handle_minutes', ROUND(COALESCE(_avg_handle_min, 0)::numeric, 2),
    'transfers', _transfers,
    'by_agent', _by_agent,
    'ratings', _ratings,
    'score_distribution', _score_dist,
    'daily', _daily
  );

  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_attendance_reports(uuid, timestamptz, timestamptz, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_attendance_reports(uuid, timestamptz, timestamptz, uuid) TO authenticated;
