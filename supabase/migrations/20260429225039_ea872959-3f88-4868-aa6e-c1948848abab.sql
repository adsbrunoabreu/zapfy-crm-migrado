CREATE OR REPLACE FUNCTION public.capture_rating_response_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket_id UUID;
  _rating public.attendance_ticket_ratings;
  _txt TEXT;
  _num NUMERIC;
  _max NUMERIC;
BEGIN
  -- Apenas mensagens recebidas (do cliente)
  IF NEW.from_me THEN
    RETURN NEW;
  END IF;

  -- Buscar ticket mais recente da conversa
  SELECT id INTO _ticket_id FROM public.attendance_tickets
  WHERE conversation_id = NEW.conversation_id
  ORDER BY created_at DESC LIMIT 1;
  IF _ticket_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Existe avaliação pendente?
  SELECT * INTO _rating FROM public.attendance_ticket_ratings
  WHERE ticket_id = _ticket_id AND status = 'pending'
  ORDER BY requested_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  _txt := COALESCE(NEW.content, '');
  IF length(_txt) = 0 OR length(_txt) > 200 THEN
    RETURN NEW;
  END IF;

  -- Extrai primeiro número da mensagem
  _num := NULLIF((regexp_match(_txt, '(\d+(?:[.,]\d+)?)'))[1], '')::NUMERIC;
  IF _num IS NULL THEN
    RETURN NEW;
  END IF;

  -- Valida intervalo conforme escala
  _max := CASE _rating.scale
    WHEN 'nps' THEN 10
    WHEN 'numeric' THEN 5
    ELSE 5
  END;
  IF _num < 0 OR _num > _max THEN
    RETURN NEW;
  END IF;

  -- Verifica janela
  IF _rating.response_window_hours > 0
     AND _rating.requested_at < now() - make_interval(hours => _rating.response_window_hours) THEN
    UPDATE public.attendance_ticket_ratings SET status = 'expired' WHERE id = _rating.id;
    RETURN NEW;
  END IF;

  UPDATE public.attendance_ticket_ratings
  SET score = _num,
      raw_response = _txt,
      responded_at = COALESCE(NEW.timestamp, now()),
      status = 'responded'
  WHERE id = _rating.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_rating_response ON public.chat_messages;
CREATE TRIGGER trg_capture_rating_response
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.capture_rating_response_from_message();