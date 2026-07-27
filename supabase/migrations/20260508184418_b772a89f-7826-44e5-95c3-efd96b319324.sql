CREATE OR REPLACE FUNCTION public.get_attendance_messages_by_hour(
  _company_id uuid DEFAULT NULL,
  _range text DEFAULT '7d'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cid uuid;
  _from timestamptz;
  _to timestamptz := now();
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

  _from := CASE _range
    WHEN 'today' THEN date_trunc('day', now())
    WHEN '30d' THEN now() - interval '30 days'
    ELSE now() - interval '7 days'
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
$$;