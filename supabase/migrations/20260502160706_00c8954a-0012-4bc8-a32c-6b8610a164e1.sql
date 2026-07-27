CREATE OR REPLACE FUNCTION public.pause_ai_on_human_takeover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state_id uuid;
  v_agent_name text;
  v_pause_until timestamptz := now() + interval '4 hours';
BEGIN
  -- Só nos importa mensagens enviadas pela empresa (from_me=true)
  IF NEW.from_me IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Carrega estado da IA pra essa conversa (se houver)
  SELECT s.id, a.name
  INTO v_state_id, v_agent_name
  FROM public.conversation_ai_state s
  LEFT JOIN public.ai_agents a ON a.id = s.agent_id
  WHERE s.conversation_id = NEW.conversation_id
  LIMIT 1;

  -- Sem estado ativo de IA → nada a pausar
  IF v_state_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Se a mensagem foi do próprio robô (sender_name "🤖 <agente>"), ignorar
  IF NEW.sender_name IS NOT NULL
     AND v_agent_name IS NOT NULL
     AND NEW.sender_name = '🤖 ' || v_agent_name THEN
    RETURN NEW;
  END IF;

  -- Pausa imediata (apenas se ainda não estiver em handoff/done)
  UPDATE public.conversation_ai_state
  SET status = 'paused',
      paused_until = v_pause_until,
      handoff_reason = 'human_took_over',
      updated_at = now()
  WHERE id = v_state_id
    AND status NOT IN ('handoff', 'done');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pause_ai_on_human_takeover ON public.chat_messages;

CREATE TRIGGER trg_pause_ai_on_human_takeover
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.pause_ai_on_human_takeover();