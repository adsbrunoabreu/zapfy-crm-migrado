-- 1. Política de retenção: message_sync_log (30 dias, sem arquivar — é debug)
INSERT INTO public.log_retention_policies (table_name, hot_days, archive_days, archive_enabled, enabled)
VALUES ('message_sync_log', 30, 0, false, true)
ON CONFLICT (table_name) DO NOTHING;

-- 2. Função: nullifica payloads pesados em chat_messages após N dias
CREATE OR REPLACE FUNCTION public.purge_chat_message_payloads(_retention_days int DEFAULT 30)
RETURNS TABLE(updated integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected INTEGER := 0;
BEGIN
  UPDATE public.chat_messages
  SET provider_raw_payload = NULL,
      raw_data = NULL
  WHERE created_at < now() - (_retention_days || ' days')::interval
    AND (provider_raw_payload IS NOT NULL OR raw_data IS NOT NULL);
  GET DIAGNOSTICS affected = ROW_COUNT;

  INSERT INTO public.system_logs (event, level, metadata)
  VALUES (
    'chat_message_payloads_purged',
    'info',
    jsonb_build_object('retention_days', _retention_days, 'rows_updated', affected)
  );

  RETURN QUERY SELECT affected;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_chat_message_payloads(int) FROM PUBLIC, anon, authenticated;

-- 3. Cron diário 03:30 UTC chamando a função SQL diretamente (sem HTTP).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chat-payload-purge-daily') THEN
    PERFORM cron.unschedule('chat-payload-purge-daily');
  END IF;
  PERFORM cron.schedule(
    'chat-payload-purge-daily',
    '30 3 * * *',
    $cron$ SELECT public.purge_chat_message_payloads(30); $cron$
  );
END $$;
