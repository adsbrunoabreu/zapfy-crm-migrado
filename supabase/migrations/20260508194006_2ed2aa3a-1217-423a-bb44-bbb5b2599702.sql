CREATE OR REPLACE FUNCTION public.set_lead_responded_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _lead_id uuid;
BEGIN
  IF NOT NEW.from_me THEN
    RETURN NEW;
  END IF;

  SELECT lead_id INTO _lead_id
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF _lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Não tenta atualizar leads fechados (won/lost) para evitar
  -- bloqueio do trigger prevent_closed_lead_edits, que faria a
  -- mensagem incoming/outgoing falhar e não aparecer no chat.
  UPDATE public.leads
  SET responded_at = COALESCE(NEW.timestamp, NEW.created_at, now())
  WHERE id = _lead_id
    AND responded_at IS NULL
    AND status NOT IN ('won','lost');

  RETURN NEW;
END;
$function$;