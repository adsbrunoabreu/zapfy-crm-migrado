CREATE OR REPLACE FUNCTION public._next_ticket_code(_company_id uuid)
RETURNS TABLE(num int, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings public.attendance_settings;
  _prefix text;
  _next int;
BEGIN
  SELECT * INTO _settings FROM public.attendance_settings
   WHERE company_id = _company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.attendance_settings (company_id) VALUES (_company_id)
    RETURNING * INTO _settings;
  END IF;

  _prefix := COALESCE(_settings.tickets->>'prefix', 'ATD');
  _next := COALESCE((_settings.tickets->>'next_number')::int, 1);

  UPDATE public.attendance_settings
     SET tickets = jsonb_set(COALESCE(tickets, '{}'::jsonb), '{next_number}', to_jsonb(_next + 1))
   WHERE company_id = _company_id;

  num := _next;
  code := _prefix || '-' || lpad(_next::text, 5, '0');
  RETURN NEXT;
END;
$$;