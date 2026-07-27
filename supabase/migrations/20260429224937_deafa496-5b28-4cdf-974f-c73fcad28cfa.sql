CREATE TABLE IF NOT EXISTS public.attendance_ticket_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.attendance_tickets(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  scale TEXT NOT NULL DEFAULT 'stars',
  score NUMERIC,
  comment TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  response_window_hours INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  raw_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_ratings_unique_pending
  ON public.attendance_ticket_ratings (ticket_id)
  WHERE status IN ('pending','responded');

CREATE INDEX IF NOT EXISTS idx_ticket_ratings_company ON public.attendance_ticket_ratings(company_id);

DROP TRIGGER IF EXISTS trg_ticket_ratings_updated_at ON public.attendance_ticket_ratings;
CREATE TRIGGER trg_ticket_ratings_updated_at
BEFORE UPDATE ON public.attendance_ticket_ratings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.attendance_ticket_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view ticket ratings"
ON public.attendance_ticket_ratings FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR company_id = get_user_company_id(auth.uid())
);

-- Registra a solicitação de avaliação (chamado ao encerrar o ticket pelo backend)
CREATE OR REPLACE FUNCTION public.record_ticket_rating_request(_ticket_id UUID)
RETURNS public.attendance_ticket_ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket public.attendance_tickets;
  _settings RECORD;
  _enabled BOOLEAN;
  _scale TEXT;
  _window INT;
  _block BOOLEAN;
  _existing public.attendance_ticket_ratings;
  _row public.attendance_ticket_ratings;
BEGIN
  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  SELECT * INTO _settings FROM public.attendance_settings WHERE company_id = _ticket.company_id;
  _enabled := COALESCE((_settings.rating->>'enabled')::BOOLEAN, false);
  _scale := COALESCE(_settings.rating->>'scale', 'stars');
  _window := COALESCE((_settings.rating->>'response_window_hours')::INT, 0);
  _block := COALESCE((_settings.rating->>'block_multiple')::BOOLEAN, true);

  IF NOT _enabled THEN
    RETURN NULL;
  END IF;

  IF _block THEN
    SELECT * INTO _existing FROM public.attendance_ticket_ratings
    WHERE ticket_id = _ticket_id AND status IN ('pending','responded')
    LIMIT 1;
    IF FOUND THEN
      RETURN _existing;
    END IF;
  END IF;

  INSERT INTO public.attendance_ticket_ratings(
    ticket_id, company_id, scale, response_window_hours, status
  ) VALUES (
    _ticket_id, _ticket.company_id, _scale, _window, 'pending'
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

-- Registra a resposta do cliente (chamada por edge function a partir do webhook)
CREATE OR REPLACE FUNCTION public.submit_ticket_rating(
  _ticket_id UUID,
  _score NUMERIC,
  _comment TEXT DEFAULT NULL,
  _raw_response TEXT DEFAULT NULL
)
RETURNS public.attendance_ticket_ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.attendance_ticket_ratings;
BEGIN
  SELECT * INTO _row FROM public.attendance_ticket_ratings
  WHERE ticket_id = _ticket_id AND status = 'pending'
  ORDER BY requested_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No pending rating for this ticket';
  END IF;

  IF _row.response_window_hours > 0
     AND _row.requested_at < now() - make_interval(hours => _row.response_window_hours) THEN
    UPDATE public.attendance_ticket_ratings
    SET status = 'expired'
    WHERE id = _row.id;
    RAISE EXCEPTION 'Rating window expired';
  END IF;

  UPDATE public.attendance_ticket_ratings
  SET score = _score,
      comment = _comment,
      raw_response = _raw_response,
      responded_at = now(),
      status = 'responded'
  WHERE id = _row.id
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

-- Estende close_attendance_ticket para registrar a solicitação automaticamente
CREATE OR REPLACE FUNCTION public.close_attendance_ticket(
  _ticket_id UUID,
  _reason TEXT,
  _notes TEXT DEFAULT NULL
)
RETURNS public.attendance_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket public.attendance_tickets;
  _company_id UUID;
BEGIN
  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  _company_id := public.get_user_company_id(auth.uid());
  IF _ticket.company_id <> _company_id AND NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT (public.is_company_admin(auth.uid()) OR _ticket.assigned_to = auth.uid()) THEN
    RAISE EXCEPTION 'Only the assignee or an admin can close this ticket';
  END IF;

  UPDATE public.attendance_tickets
  SET status = 'closed'::ticket_status,
      closed_at = now(),
      closed_by = auth.uid(),
      close_reason = _reason,
      close_notes = _notes
  WHERE id = _ticket_id;

  -- Registrar solicitação de avaliação se estiver habilitada
  PERFORM public.record_ticket_rating_request(_ticket_id);

  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  RETURN _ticket;
END;
$$;