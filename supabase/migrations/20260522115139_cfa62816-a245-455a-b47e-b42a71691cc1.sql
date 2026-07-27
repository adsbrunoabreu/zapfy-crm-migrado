
-- Presence: heartbeat-based online status
CREATE OR REPLACE FUNCTION public.presence_heartbeat()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.profiles
     SET is_online = true,
         last_seen = now()
   WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.presence_heartbeat() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_heartbeat() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.presence_set_offline()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.profiles
     SET is_online = false,
         last_seen = now()
   WHERE id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.presence_set_offline() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_set_offline() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mark_stale_users_offline()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH upd AS (
    UPDATE public.profiles
       SET is_online = false
     WHERE is_online = true
       AND (last_seen IS NULL OR last_seen < now() - interval '2 minutes')
     RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.mark_stale_users_offline() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stale_users_offline() TO service_role;

-- Reset estado herdado corrompido
UPDATE public.profiles SET is_online = false WHERE is_online = true;

-- Cron job: a cada 1 minuto marca usuários sem heartbeat como offline
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('presence_sweep') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'presence_sweep'
    );
    PERFORM cron.schedule(
      'presence_sweep',
      '* * * * *',
      $cron$ SELECT public.mark_stale_users_offline(); $cron$
    );
  END IF;
END $$;
