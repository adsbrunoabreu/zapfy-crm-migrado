-- Garante que a função de dispatch existe
CREATE OR REPLACE FUNCTION public.dispatch_webhook_event()
RETURNS trigger AS $$
DECLARE
  supabase_url text;
  service_role_key text;
BEGIN
  SELECT decrypted_secret INTO supabase_url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;

  SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/dispatch-webhooks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'table', TG_TABLE_NAME,
      'event', TG_OP,
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger em chat_messages
DROP TRIGGER IF EXISTS dispatch_webhook_event ON public.chat_messages;
CREATE TRIGGER dispatch_webhook_event
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_webhook_event();

-- Trigger em leads
DROP TRIGGER IF EXISTS dispatch_webhook_event ON public.leads;
CREATE TRIGGER dispatch_webhook_event
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_webhook_event();