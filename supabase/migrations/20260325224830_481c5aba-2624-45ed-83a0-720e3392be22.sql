-- Remove todos os triggers conflitantes das duas migrations anteriores
DROP TRIGGER IF EXISTS trigger_webhook_on_lead ON public.leads;
DROP TRIGGER IF EXISTS trigger_webhook_on_message ON public.chat_messages;
DROP TRIGGER IF EXISTS dispatch_webhook_event ON public.leads;
DROP TRIGGER IF EXISTS dispatch_webhook_event ON public.chat_messages;

-- Recria a função com lógica completa de eventos
CREATE OR REPLACE FUNCTION public.dispatch_webhook_event()
RETURNS trigger AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  event_type text;
  payload jsonb;
BEGIN
  SELECT decrypted_secret INTO supabase_url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;

  SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;

  IF TG_TABLE_NAME = 'leads' THEN
    IF TG_OP = 'INSERT' THEN
      event_type := 'lead.created';
    ELSIF TG_OP = 'UPDATE' THEN
      IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
        event_type := 'lead.stage_changed';
      ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
        event_type := 'lead.assigned';
      ELSIF OLD.status IS DISTINCT FROM NEW.status THEN
        event_type := 'lead.status_changed';
      ELSE
        event_type := 'lead.updated';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'chat_messages' THEN
    IF (NEW.direction = 'inbound') THEN
      event_type := 'message.received';
    ELSE
      event_type := 'message.sent';
    END IF;
  END IF;

  payload := jsonb_build_object(
    'event', event_type,
    'table', TG_TABLE_NAME,
    'operation', TG_OP,
    'record', row_to_json(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END,
    'timestamp', now()
  );

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/dispatch-webhooks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := payload
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recria os triggers uma única vez em cada tabela
CREATE TRIGGER dispatch_webhook_event
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_webhook_event();

CREATE TRIGGER dispatch_webhook_event
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_webhook_event();