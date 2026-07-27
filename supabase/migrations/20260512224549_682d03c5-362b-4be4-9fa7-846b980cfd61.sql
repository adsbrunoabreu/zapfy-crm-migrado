
CREATE OR REPLACE FUNCTION public.get_alert_cron_status()
RETURNS TABLE(
  job_key text,
  jobname text,
  schedule text,
  active boolean,
  last_run_at timestamptz,
  last_run_status text,
  last_run_message text,
  last_run_duration_ms int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  WITH mapped AS (
    SELECT
      j.jobid,
      j.jobname,
      j.schedule,
      j.active,
      CASE
        WHEN j.jobname LIKE 'monitor-instance-health%'  THEN 'monitor-instance-health'
        WHEN j.jobname LIKE 'auto-reconnect-instances%' THEN 'auto-reconnect-instances'
        WHEN j.jobname LIKE 'webhook-retry-worker%'     THEN 'webhook-retry-worker'
        WHEN j.jobname LIKE 'messaging-alerts%'         THEN 'messaging-alerts-check'
        WHEN j.jobname LIKE 'ai-usage-alerts%'          THEN 'ai-usage-alerts'
        WHEN j.jobname LIKE 'trial-reminders%'          THEN 'trial-reminders'
      END AS job_key
    FROM cron.job j
  ),
  last_run AS (
    SELECT DISTINCT ON (d.jobid)
      d.jobid,
      d.start_time,
      d.end_time,
      d.status,
      d.return_message
    FROM cron.job_run_details d
    ORDER BY d.jobid, d.start_time DESC
  )
  SELECT
    m.job_key,
    m.jobname,
    m.schedule,
    m.active,
    lr.start_time AS last_run_at,
    lr.status     AS last_run_status,
    lr.return_message AS last_run_message,
    EXTRACT(EPOCH FROM (lr.end_time - lr.start_time))::int * 1000 AS last_run_duration_ms
  FROM mapped m
  LEFT JOIN last_run lr ON lr.jobid = m.jobid
  WHERE m.job_key IS NOT NULL
  ORDER BY m.job_key;
END;
$$;

REVOKE ALL ON FUNCTION public.get_alert_cron_status() FROM public;
GRANT EXECUTE ON FUNCTION public.get_alert_cron_status() TO authenticated;
