
-- 1) conversations.assigned_to + assigned_at
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS assigned_to uuid,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_company_assigned
  ON public.conversations(company_id, assigned_to);

-- 2) Backfill auto_create=false em todas as configurações existentes
UPDATE public.attendance_settings
   SET tickets = jsonb_set(tickets, '{auto_create}', 'false'::jsonb, true)
 WHERE NOT (tickets ? 'auto_create');

-- 3) Backfill conversations.assigned_to a partir do ticket ativo mais recente
UPDATE public.conversations c
   SET assigned_to = t.assigned_to,
       assigned_at = COALESCE(t.assigned_at, t.created_at)
  FROM (
    SELECT DISTINCT ON (conversation_id)
      conversation_id, assigned_to, assigned_at, created_at
    FROM public.attendance_tickets
    WHERE assigned_to IS NOT NULL
    ORDER BY conversation_id, created_at DESC
  ) t
 WHERE t.conversation_id = c.id
   AND c.assigned_to IS NULL;

-- 4) Refatorar reopen_conversation_on_new_message
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
  _auto_create boolean := false;
BEGIN
  BEGIN
    SELECT id, company_id, lead_id, phone, contact_name, closed_at, last_message_at, assigned_to
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

    -- Atribuição automática da conversa quando ainda não tem assignee.
    IF _conv.assigned_to IS NULL THEN
      _assignee := public.pick_reopen_assignee(_conv.id, _preferred);
      IF _assignee IS NOT NULL THEN
        UPDATE public.conversations
           SET assigned_to = _assignee, assigned_at = now()
         WHERE id = _conv.id AND assigned_to IS NULL;
        _conv.assigned_to := _assignee;
      END IF;
    END IF;

    SELECT * INTO _ticket FROM public.attendance_tickets
     WHERE conversation_id = _conv.id ORDER BY created_at DESC LIMIT 1;
    _ticket_found := FOUND;

    SELECT * INTO _settings FROM public.attendance_settings
     WHERE company_id = _conv.company_id LIMIT 1;

    IF _settings IS NOT NULL THEN
      _allow_reopen := COALESCE((_settings.closing->>'allow_reopen')::boolean, true);
      _window_hours := COALESCE((_settings.closing->>'reopen_window_hours')::int, 24);
      _auto_create := COALESCE((_settings.tickets->>'auto_create')::boolean, false);
    END IF;

    IF _ticket_found AND _ticket.status IN ('closed','awaiting_rating') THEN
      _ticket_age := now() - COALESCE(_ticket.closed_at, _ticket.updated_at);
      IF NOT _allow_reopen OR _ticket_age > make_interval(hours => _window_hours) THEN
        _should_create_new := true;
      END IF;
    END IF;

    -- Criação automática de ticket só quando habilitada nas configurações.
    IF (NOT _ticket_found OR _should_create_new) THEN
      IF NOT _auto_create THEN
        RETURN NEW;
      END IF;

      _assignee := COALESCE(_conv.assigned_to, public.pick_reopen_assignee(_conv.id, _preferred));
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

-- 5) Espelha ticket.assigned_to → conversations.assigned_to (transferências)
CREATE OR REPLACE FUNCTION public.sync_conversation_assignee_from_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.conversation_id IS NULL OR NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;
  UPDATE public.conversations
     SET assigned_to = NEW.assigned_to,
         assigned_at = COALESCE(NEW.assigned_at, now())
   WHERE id = NEW.conversation_id
     AND COALESCE(assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) IS DISTINCT FROM NEW.assigned_to;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_conversation_assignee_from_ticket ON public.attendance_tickets;
CREATE TRIGGER trg_sync_conversation_assignee_from_ticket
  AFTER INSERT OR UPDATE OF assigned_to ON public.attendance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.sync_conversation_assignee_from_ticket();

-- 6) create_attendance_ticket: herda assignee da conversa quando _assigned_to nulo
CREATE OR REPLACE FUNCTION public.create_attendance_ticket(_conversation_id uuid, _lead_id uuid DEFAULT NULL::uuid, _contact_phone text DEFAULT NULL::text, _contact_name text DEFAULT NULL::text, _priority text DEFAULT NULL::text, _category text DEFAULT NULL::text, _assigned_to uuid DEFAULT NULL::uuid)
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

  -- Herda assignee já gravado na conversa (atribuição automática) quando nada foi informado.
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
    auth.uid()
  ) RETURNING * INTO _ticket;

  RETURN _ticket;
END;
$function$;
