
ALTER TABLE public.attendance_tickets
  ADD COLUMN IF NOT EXISTS rating_deadline TIMESTAMPTZ;

DROP FUNCTION IF EXISTS public.close_attendance_ticket(uuid, text, text);
DROP FUNCTION IF EXISTS public.close_attendance_ticket(uuid, text, text, boolean);
DROP FUNCTION IF EXISTS public.create_attendance_ticket(uuid, uuid, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.close_attendance_ticket(
  _ticket_id UUID,
  _reason TEXT,
  _notes TEXT DEFAULT NULL,
  _skip_rating BOOLEAN DEFAULT false
)
RETURNS public.attendance_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket public.attendance_tickets;
  _company_id UUID;
  _settings RECORD;
  _rating_enabled BOOLEAN;
  _window INT;
BEGIN
  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;

  _company_id := public.get_user_company_id(auth.uid());
  IF _ticket.company_id <> _company_id AND NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NOT (public.is_company_admin(auth.uid()) OR _ticket.assigned_to = auth.uid()) THEN
    RAISE EXCEPTION 'Only the assignee or an admin can close this ticket';
  END IF;

  SELECT * INTO _settings FROM public.attendance_settings WHERE company_id = _ticket.company_id;
  _rating_enabled := COALESCE((_settings.rating->>'enabled')::BOOLEAN, false);
  _window := COALESCE(NULLIF((_settings.rating->>'response_window_hours')::INT, 0), 12);
  IF _window NOT IN (6,12,24) THEN _window := 12; END IF;

  IF _rating_enabled
     AND COALESCE(_skip_rating, false) = false
     AND _ticket.contact_phone IS NOT NULL THEN
    UPDATE public.attendance_tickets
    SET status = 'awaiting_rating'::ticket_status,
        rating_deadline = now() + make_interval(hours => _window),
        close_reason = _reason,
        close_notes = _notes,
        closed_by = auth.uid()
    WHERE id = _ticket_id;
  ELSE
    UPDATE public.attendance_tickets
    SET status = 'closed'::ticket_status,
        closed_at = now(),
        closed_by = auth.uid(),
        close_reason = _reason,
        close_notes = _notes,
        rating_deadline = NULL
    WHERE id = _ticket_id;
  END IF;

  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  RETURN _ticket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.close_attendance_ticket(uuid, text, text, boolean) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.close_attendance_ticket(uuid, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.capture_rating_response_from_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ticket_id UUID;
  _rating public.attendance_ticket_ratings;
  _txt TEXT;
  _num NUMERIC;
  _max NUMERIC;
BEGIN
  IF NEW.from_me THEN RETURN NEW; END IF;

  SELECT id INTO _ticket_id FROM public.attendance_tickets
  WHERE conversation_id = NEW.conversation_id
  ORDER BY created_at DESC LIMIT 1;
  IF _ticket_id IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _rating FROM public.attendance_ticket_ratings
  WHERE ticket_id = _ticket_id AND status = 'pending'
  ORDER BY requested_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN NEW; END IF;

  _txt := COALESCE(NEW.content, '');
  IF length(_txt) = 0 OR length(_txt) > 200 THEN RETURN NEW; END IF;

  IF _txt ~ '(😀|😄|😊|🙂|👍|❤️|⭐⭐⭐⭐⭐)' THEN
    _num := 5;
  ELSIF _txt ~ '(😐|😑|🤔|⭐⭐⭐)' THEN
    _num := 3;
  ELSIF _txt ~ '(😞|😠|😡|☹️|👎|⭐)' THEN
    _num := 1;
  ELSE
    _num := NULLIF((regexp_match(_txt, '(\d+(?:[.,]\d+)?)'))[1], '')::NUMERIC;
  END IF;

  IF _num IS NULL THEN RETURN NEW; END IF;

  _max := CASE _rating.scale WHEN 'nps' THEN 10 WHEN 'numeric' THEN 5 ELSE 5 END;
  IF _num < 0 OR _num > _max THEN RETURN NEW; END IF;

  IF _rating.response_window_hours > 0
     AND _rating.requested_at < now() - make_interval(hours => _rating.response_window_hours) THEN
    UPDATE public.attendance_ticket_ratings SET status = 'expired' WHERE id = _rating.id;
    UPDATE public.attendance_tickets
    SET status = 'closed'::ticket_status,
        closed_at = now(),
        rating_deadline = NULL,
        close_reason = COALESCE(close_reason, 'Encerrado após expiração da avaliação')
    WHERE id = _ticket_id AND status = 'awaiting_rating'::ticket_status;
    RETURN NEW;
  END IF;

  UPDATE public.attendance_ticket_ratings
  SET score = _num,
      raw_response = _txt,
      responded_at = COALESCE(NEW.timestamp, now()),
      status = 'responded'
  WHERE id = _rating.id;

  UPDATE public.attendance_tickets
  SET status = 'closed'::ticket_status,
      closed_at = now(),
      rating_deadline = NULL,
      close_reason = COALESCE(close_reason, 'Encerrado após avaliação')
  WHERE id = _ticket_id AND status = 'awaiting_rating'::ticket_status;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_close_awaiting_rating_tickets()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _count INT := 0;
BEGIN
  WITH upd AS (
    UPDATE public.attendance_tickets
    SET status = 'closed'::ticket_status,
        closed_at = now(),
        rating_deadline = NULL,
        close_reason = COALESCE(close_reason, 'Encerrado após prazo da avaliação')
    WHERE status = 'awaiting_rating'::ticket_status
      AND rating_deadline IS NOT NULL
      AND rating_deadline < now()
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM upd;

  UPDATE public.attendance_ticket_ratings r
  SET status = 'expired'
  FROM public.attendance_tickets t
  WHERE r.ticket_id = t.id
    AND r.status = 'pending'
    AND t.status = 'closed'::ticket_status
    AND t.rating_deadline IS NULL
    AND r.response_window_hours > 0
    AND r.requested_at < now() - make_interval(hours => r.response_window_hours);

  RETURN _count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.auto_close_awaiting_rating_tickets() FROM anon, public, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('auto_close_awaiting_rating_tickets');
    EXCEPTION WHEN OTHERS THEN NULL; END;
    PERFORM cron.schedule(
      'auto_close_awaiting_rating_tickets',
      '*/5 * * * *',
      $cron$ SELECT public.auto_close_awaiting_rating_tickets(); $cron$
    );
  END IF;
END$$;

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
    AND status IN ('open','in_progress','reopened','awaiting_rating');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_attendance_ticket(
  _conversation_id UUID,
  _lead_id UUID DEFAULT NULL,
  _contact_phone TEXT DEFAULT NULL,
  _contact_name TEXT DEFAULT NULL,
  _priority TEXT DEFAULT NULL,
  _category TEXT DEFAULT NULL,
  _assigned_to UUID DEFAULT NULL
)
RETURNS public.attendance_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id UUID;
  _settings RECORD;
  _next INT;
  _code TEXT;
  _ticket public.attendance_tickets;
  _final_priority TEXT;
  _mode TEXT;
  _max_concurrent INT;
  _auto_assignee UUID;
BEGIN
  _company_id := public.get_user_company_id(auth.uid());
  IF _company_id IS NULL THEN RAISE EXCEPTION 'No company'; END IF;
  IF NOT public.is_company_active(_company_id) THEN
    RAISE EXCEPTION 'Company inactive';
  END IF;

  IF _conversation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.attendance_tickets
     WHERE conversation_id = _conversation_id
       AND status IN ('open','in_progress','reopened','awaiting_rating')
  ) THEN
    RAISE EXCEPTION 'CONVERSATION_HAS_ACTIVE_TICKET';
  END IF;

  SELECT num, code INTO _next, _code FROM public._next_ticket_code(_company_id);

  SELECT * INTO _settings FROM public.attendance_settings WHERE company_id = _company_id;
  _mode := COALESCE(_settings.tickets->>'assignment_mode', 'manual');
  _max_concurrent := COALESCE((_settings.general->>'max_concurrent_per_agent')::INT, 9999);

  IF _assigned_to IS NULL AND _mode <> 'manual' THEN
    SELECT p.id INTO _auto_assignee
      FROM public.profiles p
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS open_count
        FROM public.attendance_tickets t
        WHERE t.company_id = _company_id
          AND t.assigned_to = p.id
          AND t.status IN ('open','in_progress','reopened','awaiting_rating')
      ) c ON TRUE
     WHERE p.company_id = _company_id
       AND p.is_active = true
       AND COALESCE(c.open_count, 0) < _max_concurrent
     ORDER BY COALESCE(c.open_count, 0) ASC, p.created_at ASC
     LIMIT 1;
    _assigned_to := COALESCE(_assigned_to, _auto_assignee);
  END IF;

  _final_priority := COALESCE(_priority, 'normal');

  INSERT INTO public.attendance_tickets (
    company_id, ticket_number, ticket_code, conversation_id, lead_id,
    contact_phone, contact_name, channel, status, priority,
    category, assigned_to, assigned_at, created_by
  ) VALUES (
    _company_id, _next, _code, _conversation_id, _lead_id,
    _contact_phone, _contact_name, 'whatsapp',
    CASE WHEN _assigned_to IS NULL THEN 'open'::ticket_status ELSE 'in_progress'::ticket_status END,
    _final_priority,
    _category, _assigned_to,
    CASE WHEN _assigned_to IS NULL THEN NULL ELSE now() END,
    auth.uid()
  ) RETURNING * INTO _ticket;

  RETURN _ticket;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_attendance_ticket(uuid, uuid, text, text, text, text, uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.create_attendance_ticket(uuid, uuid, text, text, text, text, uuid) TO authenticated;
