
ALTER TABLE public.webhook_inbox
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS processing_duration_ms integer,
  ADD COLUMN IF NOT EXISTS instance_name text,
  ADD COLUMN IF NOT EXISTS event_type text;

CREATE INDEX IF NOT EXISTS idx_webhook_inbox_provider_created
  ON public.webhook_inbox(provider, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_inbox_instance_created
  ON public.webhook_inbox(instance_name, created_at DESC)
  WHERE instance_name IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_webhook_inbox_metrics(_window_minutes int DEFAULT 60)
RETURNS TABLE (
  provider text,
  status text,
  cnt bigint,
  avg_duration_ms numeric,
  p95_duration_ms numeric,
  max_age_seconds numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT
    provider,
    status,
    COUNT(*) AS cnt,
    ROUND(AVG(processing_duration_ms)::numeric, 1) AS avg_duration_ms,
    ROUND(percentile_cont(0.95) WITHIN GROUP (ORDER BY processing_duration_ms)::numeric, 1) AS p95_duration_ms,
    ROUND(EXTRACT(EPOCH FROM (now() - MIN(created_at)))::numeric, 1) AS max_age_seconds
  FROM public.webhook_inbox
  WHERE created_at >= now() - (_window_minutes || ' minutes')::interval
  GROUP BY provider, status
  ORDER BY provider, status;
$$;

REVOKE ALL ON FUNCTION public.get_webhook_inbox_metrics(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_webhook_inbox_metrics(int) TO authenticated, service_role;
