
CREATE OR REPLACE FUNCTION public.auto_triage_on_conversation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _settings record;
  _mode text;
  _assignee uuid;
  _prefix text;
  _next_number int;
  _code text;
  _exists boolean;
  _auto_create boolean;
BEGIN
  SELECT tickets INTO _settings
  FROM public.attendance_settings
  WHERE company_id = NEW.company_id;

  _mode := COALESCE(_settings.tickets->>'assignment_mode', 'online_least_load');
  _auto_create := COALESCE((_settings.tickets->>'auto_create')::boolean, false);

  -- Ticket criado automaticamente só quando habilitado nas configurações.
  IF NOT _auto_create THEN
    RETURN NEW;
  END IF;

  IF _mode NOT IN ('round_robin','least_load','online_least_load') THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.attendance_tickets
    WHERE conversation_id = NEW.id AND status <> 'closed'
  ) INTO _exists;
  IF _exists THEN RETURN NEW; END IF;

  -- Respeita assignee já definido na conversa (ex.: criação manual pelo agente).
  IF NEW.assigned_to IS NOT NULL THEN
    _assignee := NEW.assigned_to;
  ELSE
    _assignee := public.pick_triage_assignee(NEW.company_id, NEW.instance_id, _mode);
  END IF;

  IF _assignee IS NULL THEN
    RETURN NEW;
  END IF;

  _prefix := COALESCE(_settings.tickets->>'prefix', 'ATD');
  _next_number := COALESCE((_settings.tickets->>'next_number')::int, 1);
  _code := _prefix || '-' || lpad(_next_number::text, 5, '0');

  INSERT INTO public.attendance_tickets (
    company_id, ticket_number, ticket_code, conversation_id, lead_id,
    contact_phone, contact_name, channel, status, assigned_to, assigned_at, created_by
  ) VALUES (
    NEW.company_id, _next_number, _code, NEW.id, NEW.lead_id,
    NEW.phone, NEW.contact_name, COALESCE(NEW.provider, 'evolution'),
    'open', _assignee, now(), _assignee
  );

  IF _settings.tickets IS NOT NULL THEN
    UPDATE public.attendance_settings
    SET tickets = jsonb_set(tickets, '{next_number}', to_jsonb(_next_number + 1))
    WHERE company_id = NEW.company_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auto_triage failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;
