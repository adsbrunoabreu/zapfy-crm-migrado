ALTER TABLE public.attendance_ticket_events
  DROP CONSTRAINT IF EXISTS attendance_ticket_events_event_type_check;

ALTER TABLE public.attendance_ticket_events
  ADD CONSTRAINT attendance_ticket_events_event_type_check
  CHECK (event_type = ANY (ARRAY['opened','closed','reopened','assigned']));

CREATE OR REPLACE FUNCTION public.log_attendance_ticket_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_name TEXT;
  v_new_name TEXT;
  v_actor_id UUID;
  v_actor_name TEXT;
  v_notes TEXT;
BEGIN
  IF NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to THEN
    RETURN NEW;
  END IF;

  IF OLD.assigned_to IS NOT NULL THEN
    SELECT full_name INTO v_old_name FROM public.profiles WHERE id = OLD.assigned_to;
  END IF;
  IF NEW.assigned_to IS NOT NULL THEN
    SELECT full_name INTO v_new_name FROM public.profiles WHERE id = NEW.assigned_to;
  END IF;

  v_actor_id := auth.uid();
  IF v_actor_id IS NOT NULL THEN
    SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = v_actor_id;
  END IF;

  IF OLD.assigned_to IS NULL THEN
    v_notes := COALESCE(v_new_name, 'Atendente');
  ELSIF NEW.assigned_to IS NULL THEN
    v_notes := COALESCE(v_old_name, 'Atendente') || ' → não atribuído';
  ELSE
    v_notes := COALESCE(v_old_name, 'Atendente') || ' → ' || COALESCE(v_new_name, 'Atendente');
  END IF;

  INSERT INTO public.attendance_ticket_events
    (company_id, ticket_id, conversation_id, event_type, actor_user_id, actor_name, notes)
  VALUES
    (NEW.company_id, NEW.id, NEW.conversation_id, 'assigned', v_actor_id, v_actor_name, v_notes);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_attendance_ticket_assignment ON public.attendance_tickets;
CREATE TRIGGER trg_log_attendance_ticket_assignment
  AFTER UPDATE OF assigned_to ON public.attendance_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.log_attendance_ticket_assignment();