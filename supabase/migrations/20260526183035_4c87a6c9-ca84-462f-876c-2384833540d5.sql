CREATE OR REPLACE FUNCTION public.reopen_conversation_on_new_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _conv RECORD;
  _ticket public.attendance_tickets;
  _ticket_found boolean := false;
  _assignee uuid;
  _preferred uuid;
  _is_outbound boolean := COALESCE(NEW.from_me, false);
  _auth_uid uuid := auth.uid();
  _queue_user_id uuid;
  _new_ticket_id uuid;
  _next int;
  _code text;
  _event_reason text;
  _settings RECORD;
  _allow_reopen boolean := true;
  _window_hours int := 24;
  _ticket_age interval;
  _should_create_new boolean := false;
BEGIN
  BEGIN
    SELECT id, company_id, lead_id, phone, contact_name, closed_at, last_message_at
      INTO _conv FROM public.conversations WHERE id = NEW.conversation_id;
    IF _conv.id IS NULL THEN RETURN NEW; END IF;

    _event_reason := CASE WHEN _is_outbound THEN 'auto_outbound' ELSE 'auto_inbound' END;

    IF _is_outbound THEN
      IF _auth_uid IS NOT NULL THEN
        _preferred := _auth_uid;
      ELSIF NEW.client_id IS NOT NULL THEN
        SELECT q.user_id INTO _queue_user_id FROM public.outbound_message_queue q
         WHERE q.company_id = NEW.company_id AND q.conversation_id = NEW.conversation_id
           AND q.client_id = NEW.client_id ORDER BY q.created_at DESC LIMIT 1;
        _preferred := _queue_user_id;
      END IF;
    END IF;

    UPDATE public.conversations SET closed_at = NULL
     WHERE id = _conv.id AND closed_at IS NOT NULL;

    SELECT * INTO _ticket FROM public.attendance_tickets
     WHERE conversation_id = _conv.id ORDER BY created_at DESC LIMIT 1;
    _ticket_found := FOUND;

    SELECT * INTO _settings FROM public.attendance_settings
     WHERE company_id = _conv.company_id LIMIT 1;

    IF _settings IS NOT NULL THEN
      _allow_reopen := COALESCE((_settings.closing->>'allow_reopen')::boolean, true);
      _window_hours := COALESCE((_settings.closing->>'reopen_window_hours')::int, 24);
    END IF;

    IF _ticket_found AND _ticket.status IN ('closed','awaiting_rating') THEN
      _ticket_age := now() - COALESCE(_ticket.closed_at, _ticket.updated_at);
      IF NOT _allow_reopen OR _ticket_age > make_interval(hours => _window_hours) THEN
        _should_create_new := true;
      END IF;
    END IF;

    IF NOT _ticket_found OR _should_create_new THEN
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
        'normal', _assignee,
        CASE WHEN _assignee IS NULL THEN NULL ELSE now() END,
        COALESCE(_preferred, _auth_uid),
        COALESCE(NEW.timestamp, NEW.created_at, now()),
        CASE WHEN _should_create_new THEN now() ELSE NULL END
      ) RETURNING id INTO _new_ticket_id;

      IF _new_ticket_id IS NOT NULL THEN
        INSERT INTO public.attendance_ticket_events
          (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
        VALUES (_conv.company_id, _new_ticket_id, _conv.id, 'created', COALESCE(_preferred, _auth_uid),
           CASE WHEN _should_create_new THEN 'auto_new_after_window' ELSE _event_reason END);

        IF _assignee IS NOT NULL THEN
          INSERT INTO public.attendance_ticket_assignments
            (ticket_id, company_id, from_user_id, to_user_id, transferred_by, reason, mode)
          VALUES (_new_ticket_id, _conv.company_id, NULL, _assignee, NULL,
             CASE WHEN _should_create_new THEN 'auto_new_after_window' ELSE _event_reason END,
             'auto_reopen');

          INSERT INTO public.attendance_ticket_events
            (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
          VALUES (_conv.company_id, _new_ticket_id, _conv.id, 'assigned', _assignee,
             CASE WHEN _should_create_new THEN 'auto_new_after_window' ELSE 'auto_reopen' END);
        END IF;
      END IF;
      RETURN NEW;
    END IF;

    IF _ticket.status IN ('closed','awaiting_rating') THEN
      _assignee := public.pick_reopen_assignee(_conv.id, _preferred);
      UPDATE public.attendance_tickets
         SET status = CASE WHEN COALESCE(_assignee, assigned_to) IS NULL THEN 'open'::ticket_status ELSE 'in_progress'::ticket_status END,
             reopened_at = now(), closed_at = NULL, closed_by = NULL, close_reason = NULL,
             close_notes = NULL, rating_deadline = NULL,
             assigned_to = COALESCE(_assignee, assigned_to),
             assigned_at = CASE WHEN _assignee IS NOT NULL AND _assignee IS DISTINCT FROM assigned_to THEN now() ELSE assigned_at END,
             last_message_at = COALESCE(NEW.timestamp, NEW.created_at, now())
       WHERE id = _ticket.id;

      IF _ticket.id IS NOT NULL THEN
        INSERT INTO public.attendance_ticket_events
          (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
        VALUES (_ticket.company_id, _ticket.id, _conv.id, 'reopened', COALESCE(_preferred, _auth_uid), _event_reason);

        IF _assignee IS NOT NULL AND _assignee IS DISTINCT FROM _ticket.assigned_to THEN
          INSERT INTO public.attendance_ticket_assignments
            (ticket_id, company_id, from_user_id, to_user_id, transferred_by, reason, mode)
          VALUES (_ticket.id, _ticket.company_id, _ticket.assigned_to, _assignee, NULL, _event_reason, 'auto_reopen');

          INSERT INTO public.attendance_ticket_events
            (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
          VALUES (_ticket.company_id, _ticket.id, _conv.id, 'assigned', _assignee, 'auto_reopen');
        END IF;
      END IF;

    ELSIF _ticket.assigned_to IS NULL THEN
      _assignee := public.pick_reopen_assignee(_conv.id, _preferred);
      IF _assignee IS NOT NULL AND _ticket.id IS NOT NULL THEN
        UPDATE public.attendance_tickets
           SET assigned_to = _assignee, assigned_at = now(),
               status = CASE WHEN status = 'open'::ticket_status THEN 'in_progress'::ticket_status ELSE status END,
               last_message_at = COALESCE(NEW.timestamp, NEW.created_at, now())
         WHERE id = _ticket.id;

        INSERT INTO public.attendance_ticket_assignments
          (ticket_id, company_id, from_user_id, to_user_id, transferred_by, reason, mode)
        VALUES (_ticket.id, _ticket.company_id, NULL, _assignee, NULL, 'auto_assign', 'auto_reopen');

        INSERT INTO public.attendance_ticket_events
          (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
        VALUES (_ticket.company_id, _ticket.id, _conv.id, 'assigned', _assignee, 'auto_assign');
      ELSIF _ticket.id IS NOT NULL THEN
        UPDATE public.attendance_tickets SET last_message_at = COALESCE(NEW.timestamp, NEW.created_at, now()) WHERE id = _ticket.id;
      END IF;
    ELSE
      IF _ticket.id IS NOT NULL THEN
        UPDATE public.attendance_tickets SET last_message_at = COALESCE(NEW.timestamp, NEW.created_at, now()) WHERE id = _ticket.id;
      END IF;
    END IF;

    RETURN NEW;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[reopen_conversation_on_new_message] suppressed: msg=% conv=% sqlstate=% err=%',
      NEW.id, NEW.conversation_id, SQLSTATE, SQLERRM;
    RETURN NEW;
  END;
END;
$function$;

-- Backfill: criar tickets para conversas órfãs com mensagens nas últimas 24h
DO $$
DECLARE
  r RECORD;
  _assignee uuid;
  _next int;
  _code text;
  _new_ticket_id uuid;
BEGIN
  FOR r IN
    SELECT c.id AS conv_id, c.company_id, c.instance_id, c.lead_id,
           c.phone, c.contact_name,
           (SELECT MAX(m.timestamp) FROM public.chat_messages m WHERE m.conversation_id = c.id) AS last_msg_ts
      FROM public.conversations c
     WHERE c.last_message_at > now() - interval '24 hours'
       AND NOT EXISTS (SELECT 1 FROM public.attendance_tickets t WHERE t.conversation_id = c.id)
  LOOP
    BEGIN
      _assignee := public.pick_reopen_assignee(r.conv_id, NULL);
      SELECT num, code INTO _next, _code FROM public._next_ticket_code(r.company_id);

      INSERT INTO public.attendance_tickets (
        company_id, ticket_number, ticket_code, conversation_id, lead_id,
        contact_phone, contact_name, channel, status, priority,
        assigned_to, assigned_at, last_message_at
      ) VALUES (
        r.company_id, _next, _code, r.conv_id, r.lead_id,
        r.phone, r.contact_name, 'whatsapp',
        CASE WHEN _assignee IS NULL THEN 'open'::ticket_status ELSE 'in_progress'::ticket_status END,
        'normal', _assignee,
        CASE WHEN _assignee IS NULL THEN NULL ELSE now() END,
        COALESCE(r.last_msg_ts, now())
      ) RETURNING id INTO _new_ticket_id;

      INSERT INTO public.attendance_ticket_events
        (company_id, ticket_id, conversation_id, event_type, reason)
      VALUES (r.company_id, _new_ticket_id, r.conv_id, 'created', 'backfill_orphan_conversation');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'backfill ticket failed conv=% err=%', r.conv_id, SQLERRM;
    END;
  END LOOP;
END $$;