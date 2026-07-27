
-- Enable pg_net if not already
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function to dispatch webhook events via edge function
CREATE OR REPLACE FUNCTION public.dispatch_webhook_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event text;
  _company_id uuid;
  _payload jsonb;
  _has_webhooks boolean;
  _url text;
  _anon_key text;
BEGIN
  -- Determine event and build payload based on table
  IF TG_TABLE_NAME = 'leads' THEN
    _company_id := COALESCE(NEW.company_id, OLD.company_id);
    
    IF TG_OP = 'INSERT' THEN
      _event := 'lead.created';
      _payload := jsonb_build_object(
        'id', NEW.id,
        'name', NEW.name,
        'phone', NEW.phone,
        'email', NEW.email,
        'status', NEW.status,
        'pipeline_id', NEW.pipeline_id,
        'stage_id', NEW.stage_id,
        'assigned_to', NEW.assigned_to,
        'value', NEW.value,
        'created_at', NEW.created_at
      );
    ELSIF TG_OP = 'UPDATE' THEN
      -- Check if stage changed
      IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
        _event := 'lead.stage_changed';
        _payload := jsonb_build_object(
          'id', NEW.id,
          'name', NEW.name,
          'old_stage_id', OLD.stage_id,
          'new_stage_id', NEW.stage_id,
          'pipeline_id', NEW.pipeline_id
        );
      -- Check if assigned_to changed (transfer)
      ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
        _event := 'lead.transferred';
        _payload := jsonb_build_object(
          'id', NEW.id,
          'name', NEW.name,
          'old_assigned_to', OLD.assigned_to,
          'new_assigned_to', NEW.assigned_to
        );
      ELSE
        _event := 'lead.updated';
        _payload := jsonb_build_object(
          'id', NEW.id,
          'name', NEW.name,
          'phone', NEW.phone,
          'email', NEW.email,
          'status', NEW.status,
          'stage_id', NEW.stage_id,
          'assigned_to', NEW.assigned_to,
          'value', NEW.value
        );
      END IF;
    END IF;

  ELSIF TG_TABLE_NAME = 'chat_messages' THEN
    _company_id := NEW.company_id;
    
    IF NEW.direction = 'inbound' THEN
      _event := 'message.received';
    ELSE
      _event := 'message.sent';
    END IF;
    
    _payload := jsonb_build_object(
      'id', NEW.id,
      'lead_id', NEW.lead_id,
      'direction', NEW.direction,
      'message', NEW.message,
      'message_type', NEW.message_type,
      'sent_at', NEW.sent_at
    );
  END IF;

  -- Quick check: are there any active webhooks for this company+event?
  SELECT EXISTS (
    SELECT 1 FROM public.webhooks
    WHERE company_id = _company_id
      AND is_active = true
      AND _event = ANY(events)
  ) INTO _has_webhooks;

  IF NOT _has_webhooks THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Call edge function via pg_net
  _url := current_setting('app.settings.supabase_url', true);
  IF _url IS NULL OR _url = '' THEN
    _url := 'https://bupzemhjqzjlbsgmcdti.supabase.co';
  END IF;

  _anon_key := current_setting('app.settings.supabase_anon_key', true);
  IF _anon_key IS NULL OR _anon_key = '' THEN
    _anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cHplbWhqcXpqbGJzZ21jZHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4Mjc5ODIsImV4cCI6MjA4MTQwMzk4Mn0.S0ZiJm0I2PsT8u-ZXczcIcbhxnO1OLfL47spJp7wxgg';
  END IF;

  PERFORM extensions.http_post(
    url := _url || '/functions/v1/dispatch-webhooks',
    body := jsonb_build_object(
      'company_id', _company_id,
      'event', _event,
      'payload', _payload
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon_key
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger on leads table
CREATE TRIGGER trigger_webhook_on_lead
  AFTER INSERT OR UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_webhook_event();

-- Trigger on chat_messages table
CREATE TRIGGER trigger_webhook_on_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.dispatch_webhook_event();
