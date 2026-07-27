
CREATE OR REPLACE FUNCTION public.get_jobs_metrics(window_minutes INTEGER DEFAULT 60)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  cutoff TIMESTAMPTZ := now() - (window_minutes || ' minutes')::interval;
BEGIN
  IF NOT public.has_role(auth.uid(), 'master') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH base AS (
    SELECT * FROM public.store_integration_jobs WHERE created_at >= cutoff
  ),
  status_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE status='pending')   AS pending,
      COUNT(*) FILTER (WHERE status='running')   AS running,
      COUNT(*) FILTER (WHERE status='success')   AS success,
      COUNT(*) FILTER (WHERE status='failed')    AS failed,
      COUNT(*) FILTER (WHERE status='cancelled') AS cancelled,
      COUNT(*)                                   AS total
    FROM base
  ),
  backlog AS (
    SELECT COUNT(*) AS ready
    FROM public.store_integration_jobs
    WHERE status='pending' AND next_run_at <= now()
  ),
  retries AS (
    SELECT COUNT(*) AS retried FROM base WHERE attempts > 1
  ),
  latency AS (
    SELECT
      AVG(EXTRACT(EPOCH FROM (finished_at - created_at)))::numeric(10,2) AS avg_sec,
      (percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (finished_at - created_at))))::numeric(10,2) AS p95_sec,
      MAX(EXTRACT(EPOCH FROM (finished_at - created_at)))::numeric(10,2) AS max_sec
    FROM base
    WHERE finished_at IS NOT NULL AND status IN ('success','failed')
  ),
  per_type AS (
    SELECT job_type,
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status='success') AS success,
           COUNT(*) FILTER (WHERE status='failed')  AS failed,
           AVG(attempts)::numeric(10,2) AS avg_attempts
    FROM base GROUP BY job_type
  ),
  per_company AS (
    SELECT
      b.company_id,
      c.name AS company_name,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE b.status='success') AS success,
      COUNT(*) FILTER (WHERE b.status='failed')  AS failed,
      COUNT(*) FILTER (WHERE b.status='pending') AS pending,
      COUNT(*) FILTER (WHERE b.attempts > 1)     AS retried,
      AVG(EXTRACT(EPOCH FROM (b.finished_at - b.created_at)))
        FILTER (WHERE b.finished_at IS NOT NULL)::numeric(10,2) AS avg_latency_sec,
      MAX(b.last_error) FILTER (WHERE b.status='failed') AS last_error
    FROM base b
    LEFT JOIN public.companies c ON c.id = b.company_id
    GROUP BY b.company_id, c.name
    ORDER BY failed DESC, total DESC
    LIMIT 50
  ),
  recent_errors AS (
    SELECT id, company_id, job_type, attempts, last_error, finished_at
    FROM base WHERE status='failed' AND last_error IS NOT NULL
    ORDER BY finished_at DESC NULLS LAST LIMIT 20
  ),
  worker_health AS (
    SELECT
      MAX(finished_at) AS last_finished,
      MAX(started_at)  AS last_started
    FROM public.store_integration_jobs
  )
  SELECT jsonb_build_object(
    'window_minutes', window_minutes,
    'generated_at', now(),
    'status', (SELECT row_to_json(status_counts) FROM status_counts),
    'backlog_ready', (SELECT ready FROM backlog),
    'retried', (SELECT retried FROM retries),
    'failure_rate', CASE WHEN (SELECT total FROM status_counts) > 0
                         THEN ROUND(100.0 * (SELECT failed FROM status_counts) / (SELECT total FROM status_counts), 2)
                         ELSE 0 END,
    'retry_rate', CASE WHEN (SELECT total FROM status_counts) > 0
                       THEN ROUND(100.0 * (SELECT retried FROM retries) / (SELECT total FROM status_counts), 2)
                       ELSE 0 END,
    'latency', (SELECT row_to_json(latency) FROM latency),
    'per_type', (SELECT COALESCE(jsonb_agg(row_to_json(per_type)), '[]'::jsonb) FROM per_type),
    'per_company', (SELECT COALESCE(jsonb_agg(row_to_json(per_company)), '[]'::jsonb) FROM per_company),
    'recent_errors', (SELECT COALESCE(jsonb_agg(row_to_json(recent_errors)), '[]'::jsonb) FROM recent_errors),
    'worker', (SELECT row_to_json(worker_health) FROM worker_health)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_jobs_metrics(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_jobs_metrics(INTEGER) TO authenticated;
