CREATE OR REPLACE FUNCTION public.trg_debug_event_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.event_type NOT IN ('opened','created','closed','reopened','assigned','transferred','note','rating','escalated','responded') THEN
    INSERT INTO public.system_logs (event, level, message, metadata)
    VALUES (
      'debug_event_type',
      'error',
      'event_type inválido: ' || COALESCE(NEW.event_type::text, 'NULL'),
      jsonb_build_object('ticket_id', NEW.ticket_id, 'event_type', NEW.event_type)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_debug_event_type_bi ON public.attendance_ticket_events;
CREATE TRIGGER trg_debug_event_type_bi
BEFORE INSERT ON public.attendance_ticket_events
FOR EACH ROW EXECUTE FUNCTION public.trg_debug_event_type();