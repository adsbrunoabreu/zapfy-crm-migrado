CREATE OR REPLACE FUNCTION public.log_conversation_assignee_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from_name text;
  _to_name text;
  _actor uuid := auth.uid();
  _actor_name text;
  _notes_json text;
  _evt text;
BEGIN
  IF COALESCE(current_setting('app.skip_conv_assignee_log', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.assigned_to::text,'') = COALESCE(NEW.assigned_to::text,'') THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, email) INTO _from_name FROM public.profiles WHERE id = OLD.assigned_to;
  SELECT COALESCE(full_name, email) INTO _to_name FROM public.profiles WHERE id = NEW.assigned_to;
  SELECT COALESCE(full_name, email) INTO _actor_name FROM public.profiles WHERE id = _actor;

  _evt := CASE
    WHEN OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL THEN 'assigned'
    WHEN OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NULL THEN 'unassigned'
    ELSE 'transferred'
  END;

  _notes_json := json_build_object(
    'from_user_id', OLD.assigned_to,
    'from_name', _from_name,
    'to_user_id', NEW.assigned_to,
    'to_name', _to_name,
    'actor_user_id', _actor,
    'actor_name', _actor_name,
    'source', 'conversation'
  )::text;

  INSERT INTO public.attendance_ticket_events
    (company_id, ticket_id, conversation_id, event_type, actor_user_id, actor_name, notes)
  VALUES (NEW.company_id, NULL, NEW.id, _evt, _actor, _actor_name, _notes_json);

  RETURN NEW;
END;
$$;