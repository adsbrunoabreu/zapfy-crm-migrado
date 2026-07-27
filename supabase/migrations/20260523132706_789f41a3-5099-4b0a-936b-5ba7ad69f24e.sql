CREATE OR REPLACE VIEW public.system_health_snapshot AS
SELECT
  (SELECT COUNT(*) FROM public.system_logs WHERE level='error' AND created_at > now() - interval '1 hour')::bigint AS errors_1h,
  (SELECT COUNT(*) FROM public.outbound_message_queue WHERE status='pending' AND created_at < now() - interval '1 hour')::bigint AS stale_queue,
  (SELECT COUNT(*) FROM public.webhook_retry_queue WHERE attempts >= max_attempts)::bigint AS dead_retries,
  (SELECT COUNT(*) FROM public.chat_messages WHERE created_at > now() - interval '1 hour')::bigint AS msgs_1h,
  (SELECT pg_size_pretty(pg_database_size(current_database()))) AS db_size;

REVOKE ALL ON public.system_health_snapshot FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.run_system_health_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  snap public.system_health_snapshot%ROWTYPE;
  alerted boolean := false;
BEGIN
  SELECT * INTO snap FROM public.system_health_snapshot;

  IF snap.errors_1h > 10 OR snap.stale_queue > 5 THEN
    INSERT INTO public.system_logs (event, level, message, metadata)
    VALUES (
      'health_check',
      'warn',
      'Alerta: ' || snap.errors_1h || ' erros/1h, ' || snap.stale_queue || ' itens stale',
      to_jsonb(snap)
    );
    alerted := true;
  ELSE
    INSERT INTO public.system_logs (event, level, message, metadata)
    VALUES ('health_check', 'info', 'Health OK', to_jsonb(snap));
  END IF;

  RETURN jsonb_build_object('alerted', alerted, 'snapshot', to_jsonb(snap));
END;
$$;

REVOKE ALL ON FUNCTION public.run_system_health_check() FROM PUBLIC, anon, authenticated;

-- Agenda execução horária (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('system-health-check-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'system-health-check-hourly',
  '0 * * * *',
  $$SELECT public.run_system_health_check();$$
);