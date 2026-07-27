
-- Helper: pega service role key tentando ambos os nomes (atual e legado)
CREATE OR REPLACE FUNCTION public._get_service_role_key()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE _k text;
BEGIN
  BEGIN
    SELECT decrypted_secret INTO _k
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _k := NULL;
  END;
  IF _k IS NULL THEN
    BEGIN
      SELECT decrypted_secret INTO _k
      FROM vault.decrypted_secrets
      WHERE name = 'service_role_key' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN _k := NULL;
    END;
  END IF;
  RETURN _k;
END;
$$;

REVOKE ALL ON FUNCTION public._get_service_role_key() FROM PUBLIC;

-- 1) Trigger do Agente IA (mensagem recebida → runner)
CREATE OR REPLACE FUNCTION public.invoke_ai_agent_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_url text := 'https://bupzemhjqzjlbsgmcdti.supabase.co';
  _service_key text;
  _enabled boolean;
BEGIN
  IF NEW.from_me THEN RETURN NEW; END IF;
  IF COALESCE(NEW.content, '') = '' AND NEW.message_type <> 'audio' THEN RETURN NEW; END IF;

  SELECT public.is_ai_agent_enabled(NEW.company_id) INTO _enabled;
  IF NOT _enabled THEN RETURN NEW; END IF;

  UPDATE public.conversation_ai_state
     SET last_inbound_at = now(),
         pending_since = COALESCE(pending_since, now())
   WHERE conversation_id = NEW.conversation_id;

  _service_key := public._get_service_role_key();
  IF _service_key IS NULL THEN
    RAISE WARNING 'invoke_ai_agent_on_message: service role key ausente no vault';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := _project_url || '/functions/v1/ai-agent-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', _service_key
    ),
    body := jsonb_build_object(
      'conversation_id', NEW.conversation_id,
      'trigger_message_id', NEW.id,
      'inbound_at', extract(epoch from now())
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- 2) Trigger genérico de webhooks (dispatch-webhooks)
CREATE OR REPLACE FUNCTION public.trigger_webhook_dispatch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _project_url text := 'https://bupzemhjqzjlbsgmcdti.supabase.co';
  _service_key text;
  _event text;
  _company_id uuid;
  _record jsonb;
  _old_record jsonb;
BEGIN
  _record := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  _old_record := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;

  _company_id := COALESCE((_record->>'company_id')::uuid, (_old_record->>'company_id')::uuid);
  IF _company_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  _event := TG_ARGV[0];

  IF NOT EXISTS (
    SELECT 1 FROM public.webhooks
    WHERE company_id = _company_id
      AND is_active = true
      AND (events = '{}' OR _event = ANY(events) OR '*' = ANY(events))
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _service_key := public._get_service_role_key();

  PERFORM net.http_post(
    url := _project_url || '/functions/v1/dispatch-webhooks',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'event', _event,
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'record', _record,
      'old_record', _old_record,
      'timestamp', now()
    )
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;
