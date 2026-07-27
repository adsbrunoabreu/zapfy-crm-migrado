CREATE OR REPLACE FUNCTION public.pick_reopen_assignee(
  _conversation_id uuid,
  _preferred_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _instance_id uuid;
  _candidate uuid;
  _has_instance_links boolean := false;
  _ok boolean := false;
  _next uuid;
BEGIN
  SELECT company_id, instance_id
    INTO _company_id, _instance_id
    FROM public.conversations
   WHERE id = _conversation_id;

  IF _company_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _instance_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.instance_agents
       WHERE instance_id = _instance_id
    ) INTO _has_instance_links;
  END IF;

  IF _preferred_user_id IS NOT NULL THEN
    SELECT TRUE
      INTO _ok
      FROM public.profiles p
     WHERE p.id = _preferred_user_id
       AND p.company_id = _company_id
       AND COALESCE(p.is_active, true) = true
       AND p.role IN ('agente','admin','gestor','master','user','company_admin')
       AND (
         NOT _has_instance_links
         OR p.role IN ('admin','gestor','master','company_admin')
         OR EXISTS (
           SELECT 1
             FROM public.instance_agents ia
            WHERE ia.instance_id = _instance_id
              AND ia.user_id = p.id
         )
       );

    IF COALESCE(_ok, false) THEN
      RETURN _preferred_user_id;
    END IF;
    _ok := false;
  END IF;

  SELECT COALESCE(assigned_to, closed_by)
    INTO _candidate
    FROM public.attendance_tickets
   WHERE conversation_id = _conversation_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF _candidate IS NOT NULL THEN
    SELECT TRUE
      INTO _ok
      FROM public.profiles p
     WHERE p.id = _candidate
       AND p.company_id = _company_id
       AND COALESCE(p.is_active, true) = true
       AND p.role IN ('agente','admin','gestor','master','user','company_admin')
       AND (
         NOT _has_instance_links
         OR p.role IN ('admin','gestor','master','company_admin')
         OR EXISTS (
           SELECT 1
             FROM public.instance_agents ia
            WHERE ia.instance_id = _instance_id
              AND ia.user_id = p.id
         )
       );

    IF COALESCE(_ok, false) THEN
      RETURN _candidate;
    END IF;
    _ok := false;
  END IF;

  SELECT p.id
    INTO _next
    FROM public.profiles p
   WHERE p.company_id = _company_id
     AND COALESCE(p.is_active, true) = true
     AND COALESCE(p.is_online, false) = true
     AND p.role IN ('agente','admin','gestor','master','user','company_admin')
     AND (
       NOT _has_instance_links
       OR p.role IN ('admin','gestor','master','company_admin')
       OR EXISTS (
         SELECT 1
           FROM public.instance_agents ia
          WHERE ia.instance_id = _instance_id
            AND ia.user_id = p.id
       )
     )
   ORDER BY
     CASE p.role
       WHEN 'admin' THEN 0
       WHEN 'company_admin' THEN 0
       WHEN 'gestor' THEN 1
       WHEN 'agente' THEN 2
       WHEN 'user' THEN 2
       WHEN 'master' THEN 3
       ELSE 4
     END,
     p.last_seen DESC NULLS LAST,
     p.created_at ASC
   LIMIT 1;

  RETURN _next;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_conversation_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv RECORD;
  _ticket public.attendance_tickets;
  _assignee uuid;
  _preferred uuid;
  _is_outbound boolean := COALESCE(NEW.from_me, false);
  _auth_uid uuid := auth.uid();
  _queue_user_id uuid;
  _new_ticket_id uuid;
  _next int;
  _code text;
  _event_reason text;
BEGIN
  SELECT id, company_id, lead_id, phone, contact_name, closed_at, last_message_at
    INTO _conv
    FROM public.conversations
   WHERE id = NEW.conversation_id;

  IF _conv.id IS NULL THEN
    RETURN NEW;
  END IF;

  _event_reason := CASE WHEN _is_outbound THEN 'auto_outbound' ELSE 'auto_inbound' END;

  IF _is_outbound THEN
    IF _auth_uid IS NOT NULL THEN
      _preferred := _auth_uid;
    ELSIF NEW.client_id IS NOT NULL THEN
      SELECT q.user_id
        INTO _queue_user_id
        FROM public.outbound_message_queue q
       WHERE q.company_id = NEW.company_id
         AND q.conversation_id = NEW.conversation_id
         AND q.client_id = NEW.client_id
       ORDER BY q.created_at DESC
       LIMIT 1;
      _preferred := _queue_user_id;
    END IF;
  END IF;

  UPDATE public.conversations
     SET closed_at = NULL
   WHERE id = _conv.id
     AND closed_at IS NOT NULL;

  SELECT *
    INTO _ticket
    FROM public.attendance_tickets
   WHERE conversation_id = _conv.id
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    _assignee := public.pick_reopen_assignee(_conv.id, _preferred);
    SELECT num, code INTO _next, _code FROM public._next_ticket_code(_conv.company_id);

    INSERT INTO public.attendance_tickets (
      company_id, ticket_number, ticket_code, conversation_id, lead_id,
      contact_phone, contact_name, channel, status, priority,
      assigned_to, assigned_at, created_by, last_message_at, reopened_at
    ) VALUES (
      _conv.company_id, _next, _code, _conv.id, _conv.lead_id,
      _conv.phone, _conv.contact_name, 'whatsapp',
      CASE WHEN _assignee IS NULL THEN 'open'::ticket_status ELSE 'in_progress'::ticket_status END,
      'normal',
      _assignee,
      CASE WHEN _assignee IS NULL THEN NULL ELSE now() END,
      COALESCE(_preferred, _auth_uid),
      COALESCE(NEW.timestamp, NEW.created_at, now()),
      now()
    )
    RETURNING id INTO _new_ticket_id;

    INSERT INTO public.attendance_ticket_events
      (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
    VALUES
      (_conv.company_id, _new_ticket_id, _conv.id, 'created', COALESCE(_preferred, _auth_uid), _event_reason);

    IF _assignee IS NOT NULL THEN
      INSERT INTO public.attendance_ticket_assignments
        (ticket_id, company_id, from_user_id, to_user_id, transferred_by, reason, mode)
      VALUES
        (_new_ticket_id, _conv.company_id, NULL, _assignee, NULL, _event_reason, 'auto_reopen');

      INSERT INTO public.attendance_ticket_events
        (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
      VALUES
        (_conv.company_id, _new_ticket_id, _conv.id, 'assigned', _assignee, 'auto_reopen');
    END IF;

    RETURN NEW;
  END IF;

  IF _ticket.status IN ('closed','awaiting_rating') THEN
    _assignee := public.pick_reopen_assignee(_conv.id, _preferred);

    UPDATE public.attendance_tickets
       SET status = CASE WHEN COALESCE(_assignee, assigned_to) IS NULL THEN 'open'::ticket_status ELSE 'in_progress'::ticket_status END,
           reopened_at = now(),
           closed_at = NULL,
           closed_by = NULL,
           close_reason = NULL,
           close_notes = NULL,
           rating_deadline = NULL,
           assigned_to = COALESCE(_assignee, assigned_to),
           assigned_at = CASE
             WHEN _assignee IS NOT NULL AND _assignee IS DISTINCT FROM assigned_to THEN now()
             ELSE assigned_at
           END,
           last_message_at = COALESCE(NEW.timestamp, NEW.created_at, now())
     WHERE id = _ticket.id;

    INSERT INTO public.attendance_ticket_events
      (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
    VALUES
      (_ticket.company_id, _ticket.id, _conv.id, 'reopened', COALESCE(_preferred, _auth_uid), _event_reason);

    IF _assignee IS NOT NULL AND _assignee IS DISTINCT FROM _ticket.assigned_to THEN
      INSERT INTO public.attendance_ticket_assignments
        (ticket_id, company_id, from_user_id, to_user_id, transferred_by, reason, mode)
      VALUES
        (_ticket.id, _ticket.company_id, _ticket.assigned_to, _assignee, NULL, _event_reason, 'auto_reopen');

      INSERT INTO public.attendance_ticket_events
        (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
      VALUES
        (_ticket.company_id, _ticket.id, _conv.id, 'assigned', _assignee, 'auto_reopen');
    END IF;

  ELSIF _ticket.assigned_to IS NULL THEN
    _assignee := public.pick_reopen_assignee(_conv.id, _preferred);

    IF _assignee IS NOT NULL THEN
      UPDATE public.attendance_tickets
         SET assigned_to = _assignee,
             assigned_at = now(),
             status = CASE WHEN status = 'open'::ticket_status THEN 'in_progress'::ticket_status ELSE status END,
             last_message_at = COALESCE(NEW.timestamp, NEW.created_at, now())
       WHERE id = _ticket.id;

      INSERT INTO public.attendance_ticket_assignments
        (ticket_id, company_id, from_user_id, to_user_id, transferred_by, reason, mode)
      VALUES
        (_ticket.id, _ticket.company_id, NULL, _assignee, NULL, 'auto_assign', 'auto_reopen');

      INSERT INTO public.attendance_ticket_events
        (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
      VALUES
        (_ticket.company_id, _ticket.id, _conv.id, 'assigned', _assignee, 'auto_assign');
    ELSE
      UPDATE public.attendance_tickets
         SET last_message_at = COALESCE(NEW.timestamp, NEW.created_at, now())
       WHERE id = _ticket.id;
    END IF;
  ELSE
    UPDATE public.attendance_tickets
       SET last_message_at = COALESCE(NEW.timestamp, NEW.created_at, now())
     WHERE id = _ticket.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reopen_conversation_on_new_message ON public.chat_messages;
CREATE TRIGGER trg_reopen_conversation_on_new_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.reopen_conversation_on_new_message();