-- 1. RPC métricas de saúde
CREATE OR REPLACE FUNCTION public.get_messaging_health_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT is_master(auth.uid()) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  WITH
    wh AS (
      SELECT
        count(*) FILTER (WHERE status='pending')                                AS pending,
        count(*) FILTER (WHERE status='processing')                             AS processing,
        count(*) FILTER (WHERE status='failed')                                 AS failed,
        count(*) FILTER (WHERE status='dead')                                   AS dead,
        EXTRACT(EPOCH FROM (now() - min(received_at) FILTER (WHERE status='pending')))::int
                                                                                AS oldest_pending_age_sec
      FROM webhook_inbox
      WHERE received_at > now() - interval '7 days'
    ),
    wh_latency AS (
      SELECT
        avg(EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000)::int AS avg_latency_ms_1h,
        max(EXTRACT(EPOCH FROM (processed_at - received_at)) * 1000)::int AS p_max_latency_ms_1h
      FROM webhook_inbox
      WHERE status = 'done' AND processed_at > now() - interval '1 hour'
    ),
    out_q AS (
      SELECT
        count(*) FILTER (WHERE status='pending')                                AS pending,
        count(*) FILTER (WHERE status='sending')                                AS sending,
        count(*) FILTER (WHERE status='failed')                                 AS failed,
        count(*) FILTER (WHERE status='dead')                                   AS dead,
        coalesce(sum(retry_count), 0)::int                                      AS total_retries,
        EXTRACT(EPOCH FROM (now() - min(created_at) FILTER (WHERE status='pending')))::int
                                                                                AS oldest_pending_age_sec
      FROM outbound_message_queue
      WHERE created_at > now() - interval '7 days'
    ),
    failed_24h AS (
      SELECT count(*)::int AS n
      FROM outbound_message_queue
      WHERE status IN ('failed','dead') AND updated_at > now() - interval '24 hours'
    ),
    msgs_24h AS (
      SELECT
        count(*) FILTER (WHERE from_me) AS sent,
        count(*) FILTER (WHERE NOT from_me) AS received
      FROM chat_messages
      WHERE created_at > now() - interval '24 hours'
    )
  SELECT jsonb_build_object(
    'generated_at', now(),
    'webhook_inbox', jsonb_build_object(
      'pending',                  coalesce((SELECT pending FROM wh), 0),
      'processing',               coalesce((SELECT processing FROM wh), 0),
      'failed',                   coalesce((SELECT failed FROM wh), 0),
      'dead',                     coalesce((SELECT dead FROM wh), 0),
      'oldest_pending_age_sec',   coalesce((SELECT oldest_pending_age_sec FROM wh), 0),
      'avg_latency_ms_1h',        coalesce((SELECT avg_latency_ms_1h FROM wh_latency), 0),
      'max_latency_ms_1h',        coalesce((SELECT p_max_latency_ms_1h FROM wh_latency), 0)
    ),
    'outbound_queue', jsonb_build_object(
      'pending',                  coalesce((SELECT pending FROM out_q), 0),
      'sending',                  coalesce((SELECT sending FROM out_q), 0),
      'failed',                   coalesce((SELECT failed FROM out_q), 0),
      'dead',                     coalesce((SELECT dead FROM out_q), 0),
      'total_retries',            coalesce((SELECT total_retries FROM out_q), 0),
      'oldest_pending_age_sec',   coalesce((SELECT oldest_pending_age_sec FROM out_q), 0)
    ),
    'failed_sends_24h',           coalesce((SELECT n FROM failed_24h), 0),
    'messages_24h', jsonb_build_object(
      'sent',                     coalesce((SELECT sent FROM msgs_24h), 0),
      'received',                 coalesce((SELECT received FROM msgs_24h), 0)
    )
  )
  INTO result;

  RETURN result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_messaging_health_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_messaging_health_metrics() TO authenticated;

-- 2. RPC de alertas
CREATE OR REPLACE FUNCTION public.check_messaging_alerts()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  metrics jsonb;
  wh_pending  int;
  wh_oldest   int;
  out_pending int;
  out_dead    int;
  failed_24h  int;
  alerts_created int := 0;
  master_id   uuid;
BEGIN
  -- bypass do guard de Master para chamar a métrica
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  metrics := jsonb_build_object();

  -- Recalcula localmente sem chamar a RPC (que exige is_master)
  WITH
    wh AS (
      SELECT
        count(*) FILTER (WHERE status='pending') AS pending,
        EXTRACT(EPOCH FROM (now() - min(received_at) FILTER (WHERE status='pending')))::int AS oldest
      FROM webhook_inbox
      WHERE received_at > now() - interval '7 days'
    ),
    out_q AS (
      SELECT
        count(*) FILTER (WHERE status='pending') AS pending,
        count(*) FILTER (WHERE status='dead')    AS dead
      FROM outbound_message_queue
      WHERE created_at > now() - interval '7 days'
    ),
    f AS (
      SELECT count(*)::int AS n FROM outbound_message_queue
      WHERE status IN ('failed','dead') AND updated_at > now() - interval '24 hours'
    )
  SELECT
    coalesce((SELECT pending FROM wh), 0),
    coalesce((SELECT oldest  FROM wh), 0),
    coalesce((SELECT pending FROM out_q), 0),
    coalesce((SELECT dead    FROM out_q), 0),
    coalesce((SELECT n       FROM f), 0)
  INTO wh_pending, wh_oldest, out_pending, out_dead, failed_24h;

  metrics := jsonb_build_object(
    'wh_pending', wh_pending, 'wh_oldest_age_sec', wh_oldest,
    'out_pending', out_pending, 'out_dead', out_dead,
    'failed_sends_24h', failed_24h
  );

  FOR master_id IN SELECT user_id FROM user_roles WHERE role = 'master' LOOP
    -- Webhook backlog
    IF wh_pending > 100 OR wh_oldest > 60 THEN
      INSERT INTO app_notifications (user_id, type, title, message, severity, metadata)
      SELECT master_id, 'messaging_webhook_backlog', 'Backlog de webhooks elevado',
             format('Webhooks pendentes: %s (mais antigo: %ss)', wh_pending, wh_oldest),
             CASE WHEN wh_pending > 500 OR wh_oldest > 300 THEN 'critical' ELSE 'warning' END,
             metrics
      WHERE NOT EXISTS (
        SELECT 1 FROM app_notifications
        WHERE user_id = master_id AND type = 'messaging_webhook_backlog'
          AND created_at > now() - interval '30 minutes'
      );
      IF FOUND THEN alerts_created := alerts_created + 1; END IF;
    END IF;

    -- Outbound backlog
    IF out_pending > 200 OR out_dead > 50 THEN
      INSERT INTO app_notifications (user_id, type, title, message, severity, metadata)
      SELECT master_id, 'messaging_outbound_backlog', 'Fila de envio acumulando',
             format('Pendentes: %s | Mortas: %s', out_pending, out_dead),
             CASE WHEN out_pending > 1000 OR out_dead > 200 THEN 'critical' ELSE 'warning' END,
             metrics
      WHERE NOT EXISTS (
        SELECT 1 FROM app_notifications
        WHERE user_id = master_id AND type = 'messaging_outbound_backlog'
          AND created_at > now() - interval '30 minutes'
      );
      IF FOUND THEN alerts_created := alerts_created + 1; END IF;
    END IF;

    -- Falhas de envio
    IF failed_24h > 100 THEN
      INSERT INTO app_notifications (user_id, type, title, message, severity, metadata)
      SELECT master_id, 'messaging_failed_sends_high', 'Alto volume de falhas no envio',
             format('Mensagens falhadas em 24h: %s', failed_24h),
             CASE WHEN failed_24h > 500 THEN 'critical' ELSE 'warning' END,
             metrics
      WHERE NOT EXISTS (
        SELECT 1 FROM app_notifications
        WHERE user_id = master_id AND type = 'messaging_failed_sends_high'
          AND created_at > now() - interval '30 minutes'
      );
      IF FOUND THEN alerts_created := alerts_created + 1; END IF;
    END IF;
  END LOOP;

  IF alerts_created > 0 THEN
    INSERT INTO system_logs (event, level, metadata)
    VALUES ('messaging_alerts_created', 'warning',
            jsonb_build_object('count', alerts_created, 'metrics', metrics));
  END IF;

  RETURN jsonb_build_object('alerts_created', alerts_created, 'metrics', metrics);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_messaging_alerts() FROM PUBLIC, anon, authenticated;

-- 3. Cron 5min
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'messaging-alerts-check') THEN
    PERFORM cron.unschedule('messaging-alerts-check');
  END IF;
  PERFORM cron.schedule(
    'messaging-alerts-check',
    '*/5 * * * *',
    $cron$ SELECT public.check_messaging_alerts(); $cron$
  );
END $$;
