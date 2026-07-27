ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS attempt int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_webhook_logs_retry_pending
  ON public.webhook_logs (next_retry_at)
  WHERE success = false AND next_retry_at IS NOT NULL;

-- Cron a cada 1 minuto para o worker de retry (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'webhook-retry-worker') THEN
    PERFORM cron.unschedule('webhook-retry-worker');
  END IF;

  PERFORM cron.schedule(
    'webhook-retry-worker',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://bupzemhjqzjlbsgmcdti.supabase.co/functions/v1/webhook-retry-worker',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
    $cron$
  );
END$$;