
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS debounce_seconds smallint NOT NULL DEFAULT 8;

-- valida range 0..60 via trigger (CHECK rígido evitado pra futura flexibilidade)
CREATE OR REPLACE FUNCTION public.ai_agents_validate_debounce()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.debounce_seconds < 0 THEN NEW.debounce_seconds := 0; END IF;
  IF NEW.debounce_seconds > 60 THEN NEW.debounce_seconds := 60; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_agents_validate_debounce ON public.ai_agents;
CREATE TRIGGER trg_ai_agents_validate_debounce
BEFORE INSERT OR UPDATE ON public.ai_agents
FOR EACH ROW EXECUTE FUNCTION public.ai_agents_validate_debounce();

ALTER TABLE public.conversation_ai_state
  ADD COLUMN IF NOT EXISTS pending_since timestamptz,
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_processed_message_id uuid;

-- Atualiza o trigger para marcar last_inbound_at + pending_since (lock leve)
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
  IF COALESCE(NEW.content, '') = '' AND NEW.message_type <> 'audio' THEN RETURN NEW; END IF;

  -- Add-on habilitado?
  SELECT public.is_ai_agent_enabled(NEW.company_id) INTO _enabled;
  IF NOT _enabled THEN RETURN NEW; END IF;

  -- Marca recebimento no estado (será criado pelo runner se não existir)
  UPDATE public.conversation_ai_state
     SET last_inbound_at = now(),
         pending_since = COALESCE(pending_since, now())
   WHERE conversation_id = NEW.conversation_id;

  -- Pega service key do vault
  BEGIN
    SELECT decrypted_secret INTO _service_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _service_key := NULL;
  END;

  IF _service_key IS NULL THEN
    RETURN NEW;
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
      'trigger_message_id', NEW.id,
      'inbound_at', extract(epoch from now())
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
