DO $$
DECLARE
  cron_secret text;
BEGIN
  BEGIN
    cron_secret := vault.read_secret('CRON_SECRET');
  EXCEPTION WHEN OTHERS THEN
    cron_secret := NULL;
  END;

  PERFORM cron.unschedule('ai-global-healthcheck-hourly');

  PERFORM cron.schedule(
    'ai-global-healthcheck-hourly',
    '0 * * * *',
    format($job$
      SELECT net.http_post(
        url := 'https://bupzemhjqzjlbsgmcdti.supabase.co/functions/v1/ai-global-healthcheck',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-key', %L
        ),
        body := '{}'::jsonb
      );
    $job$, COALESCE(cron_secret, ''))
  );
END $$;