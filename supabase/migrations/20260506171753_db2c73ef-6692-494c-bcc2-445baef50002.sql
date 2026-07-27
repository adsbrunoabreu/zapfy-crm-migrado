DROP FUNCTION IF EXISTS public.create_attendance_ticket(uuid, uuid, text, text, text, text, uuid);

CREATE OR REPLACE FUNCTION public.create_attendance_ticket(
  _conversation_id UUID DEFAULT NULL,
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
  _priority_color TEXT;
  _final_priority TEXT;
  _mode TEXT;
  _max_concurrent INT;
  _auto_assignee UUID;
BEGIN
  _company_id := public.get_user_company_id(auth.uid());
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'No company';
  END IF;
  IF NOT public.is_company_active(_company_id) THEN
    RAISE EXCEPTION 'Company inactive';
  END IF;

  IF _conversation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.attendance_tickets
     WHERE conversation_id = _conversation_id
       AND status IN ('open','in_progress','reopened')
  ) THEN
    RAISE EXCEPTION 'CONVERSATION_HAS_ACTIVE_TICKET';
  END IF;

  SELECT num, code INTO _next, _code
    FROM public._next_ticket_code(_company_id);

  SELECT * INTO _settings FROM public.attendance_settings WHERE company_id = _company_id;
  _mode := COALESCE(_settings.tickets->>'assignment_mode', 'manual');
  _max_concurrent := COALESCE((_settings.general->>'max_concurrent_per_agent')::INT, 9999);

  IF _assigned_to IS NULL AND _mode <> 'manual' THEN
    IF _mode = 'load_balanced' THEN
      SELECT p.id INTO _auto_assignee
        FROM public.profiles p
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS open_count
          FROM public.attendance_tickets t
          WHERE t.company_id = _company_id
            AND t.assigned_to = p.id
            AND t.status IN ('open','in_progress','reopened')
        ) c ON TRUE
       WHERE p.company_id = _company_id
         AND p.is_active = true
         AND COALESCE(c.open_count, 0) < _max_concurrent
       ORDER BY COALESCE(c.open_count, 0) ASC, p.created_at ASC
       LIMIT 1;
    ELSE
      WITH agents AS (
        SELECT p.id, p.created_at,
               row_number() OVER (ORDER BY p.created_at, p.id) AS rn,
               COUNT(*) OVER () AS total
          FROM public.profiles p
         WHERE p.company_id = _company_id AND p.is_active = true
      ), last_assign AS (
        SELECT to_user_id FROM public.attendance_ticket_assignments
         WHERE company_id = _company_id AND to_user_id IS NOT NULL
         ORDER BY created_at DESC LIMIT 1
      ), next_idx AS (
        SELECT CASE
          WHEN (SELECT to_user_id FROM last_assign) IS NULL THEN 1
          ELSE ((SELECT rn FROM agents WHERE id = (SELECT to_user_id FROM last_assign)) % (SELECT total FROM agents LIMIT 1)) + 1
        END AS rn
      )
      SELECT a.id INTO _auto_assignee
        FROM agents a
       WHERE a.rn = (SELECT rn FROM next_idx)
         AND (
           SELECT COUNT(*) FROM public.attendance_tickets t
            WHERE t.company_id = _company_id AND t.assigned_to = a.id
              AND t.status IN ('open','in_progress','reopened')
         ) < _max_concurrent;
    END IF;
    _assigned_to := _auto_assignee;
  END IF;

  _final_priority := COALESCE(_priority, 'Média');
  SELECT (p->>'color') INTO _priority_color
    FROM jsonb_array_elements(COALESCE(_settings.tickets->'priorities','[]'::jsonb)) p
   WHERE p->>'name' = _final_priority
   LIMIT 1;

  INSERT INTO public.attendance_tickets (
    company_id, ticket_number, ticket_code, conversation_id, lead_id,
    contact_phone, contact_name, priority, priority_color, category,
    assigned_to, assigned_at, status, created_by, last_message_at
  ) VALUES (
    _company_id, _next, _code, _conversation_id, _lead_id,
    _contact_phone, _contact_name, _final_priority, _priority_color, _category,
    _assigned_to,
    CASE WHEN _assigned_to IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN _assigned_to IS NOT NULL THEN 'in_progress'::ticket_status ELSE 'open'::ticket_status END,
    auth.uid(),
    now()
  )
  RETURNING * INTO _ticket;

  RETURN _ticket;
END;
$$;