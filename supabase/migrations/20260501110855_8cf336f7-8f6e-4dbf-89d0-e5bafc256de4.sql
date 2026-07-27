-- Remove jobs antigos (se existirem) e recria com x-internal-key (CRON_SECRET)
DO $$
DECLARE
  _jid bigint;
BEGIN
  FOR _jid IN
    SELECT jobid FROM cron.job
    WHERE jobname IN (
      'monitor-instance-health-every-minute',
      'auto-reconnect-instances-every-minute',
      'process-attendance-queue-every-minute'
    )
  LOOP
    PERFORM cron.unschedule(_jid);
  END LOOP;
END $$;

SELECT cron.schedule(
  'monitor-instance-health-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bupzemhjqzjlbsgmcdti.supabase.co/functions/v1/monitor-instance-health',
    headers := '{"Content-Type":"application/json","x-internal-key":"DmBg*bRKt9M|5M+;"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'auto-reconnect-instances-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bupzemhjqzjlbsgmcdti.supabase.co/functions/v1/auto-reconnect-instances',
    headers := '{"Content-Type":"application/json","x-internal-key":"DmBg*bRKt9M|5M+;"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'process-attendance-queue-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bupzemhjqzjlbsgmcdti.supabase.co/functions/v1/process-attendance-queue',
    headers := '{"Content-Type":"application/json","x-internal-key":"DmBg*bRKt9M|5M+;"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);