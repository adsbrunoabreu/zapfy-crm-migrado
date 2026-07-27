CREATE OR REPLACE FUNCTION public._next_ticket_code(_company_id uuid)
RETURNS TABLE(num int, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings public.attendance_settings;
  _prefix text;
  _configured_next int;
  _max_existing int;
  _next int;
BEGIN
  -- Serializa a geração por empresa, inclusive quando ainda não há linha de configuração.
  PERFORM pg_advisory_xact_lock(hashtextextended(_company_id::text, 0));

  SELECT * INTO _settings
    FROM public.attendance_settings
   WHERE company_id = _company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.attendance_settings (company_id)
    VALUES (_company_id)
    ON CONFLICT (company_id) DO UPDATE SET company_id = EXCLUDED.company_id
    RETURNING * INTO _settings;
  END IF;

  _prefix := COALESCE(NULLIF(_settings.tickets->>'prefix', ''), 'ATD');
  _configured_next := COALESCE(NULLIF(_settings.tickets->>'next_number', '')::int, 1);

  SELECT COALESCE(MAX(ticket_number), 0) + 1
    INTO _max_existing
    FROM public.attendance_tickets
   WHERE company_id = _company_id;

  _next := GREATEST(_configured_next, _max_existing);

  UPDATE public.attendance_settings
     SET tickets = jsonb_set(COALESCE(tickets, '{}'::jsonb), '{next_number}', to_jsonb(_next + 1), true)
   WHERE company_id = _company_id;

  num := _next;
  code := _prefix || '-' || lpad(_next::text, 5, '0');
  RETURN NEXT;
END;
$$;