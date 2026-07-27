CREATE OR REPLACE FUNCTION public.get_alert_cron_metrics(_window_minutes integer DEFAULT 1440)
RETURNS TABLE (
  job_key text,
  source text,
  runs integer,
  errors integer,
  last_run_at timestamptz,
  last_duration_ms integer,
  avg_duration_ms integer,
  max_duration_ms integer,
  total_processed bigint,
  totals jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH cfg AS (
    SELECT * FROM (VALUES
      ('monitor-instance-health'::text, 'monitor_instances'::text, 'monitor_instances.run'::text),
      ('auto-reconnect-instances',      'auto_reconnect',          'auto_reconnect.run')
    ) AS t(job_key, source, event)
  ),
  logs AS (
    SELECT
      c.job_key,
      c.source,
      sl.created_at,
      sl.level,
      COALESCE((sl.metadata->>'duration_ms')::int, 0)  AS duration_ms,
      COALESCE((sl.metadata->>'processed')::bigint, 0) AS processed,
      sl.metadata
    FROM cfg c
    JOIN public.system_logs sl
      ON sl.source = c.source AND sl.event = c.event
    WHERE sl.created_at > now() - make_interval(mins => _window_minutes)
  ),
  agg AS (
    SELECT
      l.job_key,
      l.source,
      COUNT(*)::int AS runs,
      COUNT(*) FILTER (WHERE l.level = 'error')::int AS errors,
      MAX(l.created_at) AS last_run_at,
      AVG(l.duration_ms)::int AS avg_duration_ms,
      MAX(l.duration_ms)::int AS max_duration_ms,
      SUM(l.processed)::bigint AS total_processed,
      jsonb_build_object(
        'alerts_sent',     COALESCE(SUM((l.metadata->>'alerts_sent')::int), 0),
        'recoveries_sent', COALESCE(SUM((l.metadata->>'recoveries_sent')::int), 0),
        'attempted',       COALESCE(SUM((l.metadata->>'attempted')::int), 0),
        'succeeded',       COALESCE(SUM((l.metadata->>'succeeded')::int), 0),
        'given_up',        COALESCE(SUM((l.metadata->>'given_up')::int), 0),
        'checked',         COALESCE(SUM((l.metadata->>'checked')::int), 0)
      ) AS totals
    FROM logs l
    GROUP BY l.job_key, l.source
  ),
  last_dur AS (
    SELECT DISTINCT ON (l.job_key) l.job_key, l.duration_ms
    FROM logs l
    ORDER BY l.job_key, l.created_at DESC
  )
  SELECT
    c.job_key,
    c.source,
    COALESCE(a.runs, 0),
    COALESCE(a.errors, 0),
    a.last_run_at,
    COALESCE(ld.duration_ms, 0),
    COALESCE(a.avg_duration_ms, 0),
    COALESCE(a.max_duration_ms, 0),
    COALESCE(a.total_processed, 0),
    COALESCE(a.totals, '{}'::jsonb)
  FROM cfg c
  LEFT JOIN agg a ON a.job_key = c.job_key
  LEFT JOIN last_dur ld ON ld.job_key = c.job_key;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_alert_cron_metrics(integer) TO authenticated;