-- Helper: identifica o agente "dono" do último ticket fechado de uma conversa
CREATE OR REPLACE FUNCTION public._last_closed_ticket_owner(_conversation_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(assigned_to, closed_by)
    FROM public.attendance_tickets
   WHERE conversation_id = _conversation_id
     AND status = 'closed'
   ORDER BY COALESCE(closed_at, updated_at, created_at) DESC
   LIMIT 1
$$;

-- reopen: somente o agente anterior, admin da empresa ou Master
CREATE OR REPLACE FUNCTION public.reopen_attendance_ticket(_ticket_id uuid)
RETURNS attendance_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ticket public.attendance_tickets;
  _company_id UUID;
  _settings RECORD;
  _allow_reopen BOOLEAN;
  _window_hours INT;
  _actor UUID := auth.uid();
  _owner UUID;
BEGIN
  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  _company_id := public.get_user_company_id(_actor);
  IF _ticket.company_id <> _company_id AND NOT public.is_master(_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF _ticket.status <> 'closed' THEN
    RAISE EXCEPTION 'Ticket is not closed';
  END IF;

  -- Trava por agente anterior
  _owner := COALESCE(_ticket.assigned_to, _ticket.closed_by);
  IF _owner IS NOT NULL
     AND _actor IS DISTINCT FROM _owner
     AND NOT public.is_master(_actor)
     AND NOT public.is_company_admin(_actor) THEN
    RAISE EXCEPTION 'TICKET_LOCKED_TO_PREVIOUS_AGENT';
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
$function$;

-- create: trava por agente anterior quando houver último ticket fechado
CREATE OR REPLACE FUNCTION public.create_attendance_ticket(
  _conversation_id uuid,
  _lead_id uuid DEFAULT NULL,
  _contact_phone text DEFAULT NULL,
  _contact_name text DEFAULT NULL,
  _priority text DEFAULT NULL,
  _category text DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL
)
RETURNS attendance_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  _conv_assignee UUID;
  _actor UUID := auth.uid();
  _prev_owner UUID;
BEGIN
  _company_id := public.get_user_company_id(_actor);
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

  -- Trava: se houver ticket fechado anterior, só o agente desse ticket (ou admin/master) pode abrir outro
  IF _conversation_id IS NOT NULL THEN
    _prev_owner := public._last_closed_ticket_owner(_conversation_id);
    IF _prev_owner IS NOT NULL
       AND _actor IS DISTINCT FROM _prev_owner
       AND NOT public.is_master(_actor)
       AND NOT public.is_company_admin(_actor) THEN
      RAISE EXCEPTION 'TICKET_LOCKED_TO_PREVIOUS_AGENT';
    END IF;
    -- pré-atribui ao agente anterior se nada foi informado
    IF _assigned_to IS NULL AND _prev_owner IS NOT NULL THEN
      _assigned_to := _prev_owner;
    END IF;
  END IF;

  SELECT num, code INTO _next, _code FROM public._next_ticket_code(_company_id);

  SELECT * INTO _settings FROM public.attendance_settings WHERE company_id = _company_id;
  _mode := COALESCE(_settings.tickets->>'assignment_mode', 'manual');
  _max_concurrent := COALESCE((_settings.general->>'max_concurrent_per_agent')::INT, 9999);

  IF _assigned_to IS NULL AND _conversation_id IS NOT NULL THEN
    SELECT assigned_to INTO _conv_assignee FROM public.conversations WHERE id = _conversation_id;
    _assigned_to := COALESCE(_assigned_to, _conv_assignee);
  END IF;

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
    _actor
  ) RETURNING * INTO _ticket;

  RETURN _ticket;
END;
$function$;