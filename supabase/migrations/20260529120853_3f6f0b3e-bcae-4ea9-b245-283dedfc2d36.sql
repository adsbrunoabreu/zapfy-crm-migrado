CREATE OR REPLACE FUNCTION public.log_attendance_ticket_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _actor UUID := auth.uid();
  _actor_name TEXT;
  _assignee_name TEXT;
BEGIN
  IF _actor IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO _actor_name FROM public.profiles WHERE id = _actor LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.attendance_ticket_events (company_id, ticket_id, conversation_id, event_type, actor_user_id, actor_name, created_at)
    VALUES (NEW.company_id, NEW.id, NEW.conversation_id, 'opened', COALESCE(_actor, NEW.created_by), _actor_name, NEW.created_at);

    -- Se o ticket já nasce com responsável, registra também o evento `assigned`
    -- para que o divisor "Atribuído a X" apareça no chat mesmo sem troca de agente.
    IF NEW.assigned_to IS NOT NULL THEN
      SELECT COALESCE(full_name, email) INTO _assignee_name FROM public.profiles WHERE id = NEW.assigned_to LIMIT 1;

      INSERT INTO public.attendance_ticket_events (
        company_id, ticket_id, conversation_id, event_type,
        actor_user_id, actor_name, notes, created_at
      ) VALUES (
        NEW.company_id, NEW.id, NEW.conversation_id, 'assigned',
        _actor, _actor_name,
        jsonb_build_object(
          'from_user_id', NULL,
          'from_name', NULL,
          'to_user_id', NEW.assigned_to,
          'to_name', _assignee_name,
          'actor_user_id', _actor,
          'actor_name', _actor_name,
          'source', 'ticket_created'
        )::text,
        NEW.created_at
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'closed' AND COALESCE(OLD.status::text, '') <> 'closed' THEN
      INSERT INTO public.attendance_ticket_events (company_id, ticket_id, conversation_id, event_type, actor_user_id, actor_name, reason, notes, created_at)
      VALUES (NEW.company_id, NEW.id, NEW.conversation_id, 'closed', COALESCE(_actor, NEW.closed_by), _actor_name, NEW.close_reason, NEW.close_notes, COALESCE(NEW.closed_at, now()));
    ELSIF NEW.status = 'reopened' AND OLD.status::text = 'closed' THEN
      INSERT INTO public.attendance_ticket_events (company_id, ticket_id, conversation_id, event_type, actor_user_id, actor_name, created_at)
      VALUES (NEW.company_id, NEW.id, NEW.conversation_id, 'reopened', _actor, _actor_name, COALESCE(NEW.reopened_at, now()));
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;