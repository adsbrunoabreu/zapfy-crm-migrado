-- Atualiza last_message_at automaticamente
CREATE OR REPLACE FUNCTION public.touch_ticket_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.attendance_tickets
  SET last_message_at = COALESCE(NEW.timestamp, now())
  WHERE conversation_id = NEW.conversation_id
    AND status IN ('open','in_progress','reopened');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ticket_on_message ON public.chat_messages;
CREATE TRIGGER trg_touch_ticket_on_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.touch_ticket_on_message();

-- Encerramento manual
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

  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  RETURN _ticket;
END;
$$;

-- Reabertura
CREATE OR REPLACE FUNCTION public.reopen_attendance_ticket(_ticket_id UUID)
RETURNS public.attendance_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket public.attendance_tickets;
  _company_id UUID;
  _settings RECORD;
  _allow_reopen BOOLEAN;
  _window_hours INT;
BEGIN
  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  _company_id := public.get_user_company_id(auth.uid());
  IF _ticket.company_id <> _company_id AND NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _ticket.status <> 'closed' THEN
    RAISE EXCEPTION 'Ticket is not closed';
  END IF;

  SELECT * INTO _settings FROM public.attendance_settings WHERE company_id = _ticket.company_id;
  _allow_reopen := COALESCE((_settings.closing->>'allow_reopen')::BOOLEAN, true);
  _window_hours := COALESCE((_settings.closing->>'reopen_window_hours')::INT, 24);

  IF NOT _allow_reopen THEN
    RAISE EXCEPTION 'Reopening is disabled';
  END IF;

  IF _window_hours > 0 AND _ticket.closed_at < now() - make_interval(hours => _window_hours) THEN
    RAISE EXCEPTION 'Reopen window expired';
  END IF;

  UPDATE public.attendance_tickets
  SET status = 'reopened'::ticket_status,
      reopened_at = now(),
      closed_at = NULL,
      closed_by = NULL,
      close_reason = NULL,
      close_notes = NULL
  WHERE id = _ticket_id;

  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  RETURN _ticket;
END;
$$;

-- Auto-encerramento por inatividade (chamado por cron)
CREATE OR REPLACE FUNCTION public.auto_close_inactive_tickets()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count INT := 0;
  _row RECORD;
BEGIN
  FOR _row IN
    SELECT t.id, COALESCE((s.closing->>'inactivity_minutes')::INT, 0) AS minutes
    FROM public.attendance_tickets t
    JOIN public.attendance_settings s ON s.company_id = t.company_id
    WHERE t.status IN ('open','in_progress','reopened')
      AND COALESCE((s.closing->>'inactivity_minutes')::INT, 0) > 0
      AND COALESCE(t.last_message_at, t.created_at) < now() - make_interval(mins => COALESCE((s.closing->>'inactivity_minutes')::INT, 0))
  LOOP
    UPDATE public.attendance_tickets
    SET status = 'closed'::ticket_status,
        closed_at = now(),
        close_reason = 'Encerrado automaticamente por inatividade'
    WHERE id = _row.id;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$$;