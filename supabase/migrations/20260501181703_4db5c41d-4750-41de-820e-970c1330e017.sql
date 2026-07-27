-- Trigger que invoca a edge function ai-agent-runner ao receber mensagem do cliente
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
  -- Só dispara para mensagens recebidas
  IF NEW.from_me THEN RETURN NEW; END IF;
  IF COALESCE(NEW.content, '') = '' THEN RETURN NEW; END IF;

  -- Add-on habilitado?
  SELECT public.is_ai_agent_enabled(NEW.company_id) INTO _enabled;
  IF NOT _enabled THEN RETURN NEW; END IF;

  -- Pega service key do vault
  BEGIN
    SELECT decrypted_secret INTO _service_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _service_key := NULL;
  END;

  IF _service_key IS NULL THEN
    RETURN NEW; -- silencioso; falta de secret não pode quebrar inserção
  END IF;

  -- Dispara assíncrono
  PERFORM net.http_post(
    url := _project_url || '/functions/v1/ai-agent-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', _service_key
    ),
    body := jsonb_build_object(
      'conversation_id', NEW.conversation_id,
      'trigger_message_id', NEW.id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- nunca quebrar a transação principal
END;
$$;

DROP TRIGGER IF EXISTS trg_invoke_ai_agent ON public.chat_messages;
CREATE TRIGGER trg_invoke_ai_agent
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.invoke_ai_agent_on_message();