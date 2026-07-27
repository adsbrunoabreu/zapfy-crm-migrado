
CREATE OR REPLACE FUNCTION public.tg_lead_history_on_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actor uuid := auth.uid();
  _actor_name text := public._lead_history_actor_name(_actor);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.lead_id IS NOT NULL THEN
    INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
    VALUES (NEW.company_id, NEW.lead_id, 'ticket_opened', _actor, _actor_name,
      jsonb_build_object('ticket_id', NEW.id, 'ticket_code', NEW.ticket_code));
  ELSIF TG_OP = 'UPDATE' AND NEW.lead_id IS NOT NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text = 'closed' THEN
      INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
      VALUES (NEW.company_id, NEW.lead_id, 'ticket_closed', _actor, _actor_name,
        jsonb_build_object('ticket_id', NEW.id, 'ticket_code', NEW.ticket_code, 'reason', NEW.close_reason));
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
      VALUES (NEW.company_id, NEW.lead_id, 'ticket_transferred', _actor, _actor_name,
        jsonb_build_object(
          'ticket_id', NEW.id,
          'ticket_code', NEW.ticket_code,
          'from', OLD.assigned_to, 'to', NEW.assigned_to,
          'from_name', public._lead_history_actor_name(OLD.assigned_to),
          'to_name', public._lead_history_actor_name(NEW.assigned_to)
        ));
    END IF;
    IF NEW.priority IS DISTINCT FROM OLD.priority THEN
      INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
      VALUES (NEW.company_id, NEW.lead_id, 'ticket_priority_changed', _actor, _actor_name,
        jsonb_build_object(
          'ticket_id', NEW.id,
          'ticket_code', NEW.ticket_code,
          'from', OLD.priority,
          'to', NEW.priority,
          'to_color', NEW.priority_color
        ));
    END IF;
    IF NEW.category IS DISTINCT FROM OLD.category THEN
      INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
      VALUES (NEW.company_id, NEW.lead_id, 'ticket_category_changed', _actor, _actor_name,
        jsonb_build_object(
          'ticket_id', NEW.id,
          'ticket_code', NEW.ticket_code,
          'from', OLD.category,
          'to', NEW.category
        ));
    END IF;
  END IF;
  RETURN NEW;
END $function$;
