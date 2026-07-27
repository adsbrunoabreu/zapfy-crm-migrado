-- Versão pura/testável: recebe a configuração e o instante explicitamente
CREATE OR REPLACE FUNCTION public.is_off_business_hours_at(
  _business_hours jsonb,
  _holidays jsonb,
  _at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _tz TEXT;
  _local TIMESTAMP;
  _dow INT;
  _day_keys TEXT[] := ARRAY['sun','mon','tue','wed','thu','fri','sat'];
  _key TEXT;
  _day JSONB;
  _start TIME;
  _end TIME;
  _now_time TIME;
  _today DATE;
BEGIN
  IF _business_hours IS NULL THEN
    RETURN false;
  END IF;

  _tz := COALESCE(_business_hours->>'timezone', 'America/Sao_Paulo');
  _local := _at AT TIME ZONE _tz;
  _today := _local::DATE;
  _now_time := _local::TIME;
  _dow := EXTRACT(DOW FROM _local)::INT;

  IF _holidays IS NOT NULL AND jsonb_typeof(_holidays) = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(_holidays) h
      WHERE (h->>'date')::DATE = _today
    ) THEN
      RETURN true;
    END IF;
  END IF;

  _key := _day_keys[_dow + 1];
  _day := _business_hours->'days'->_key;

  IF _day IS NULL OR NOT COALESCE((_day->>'enabled')::BOOLEAN, false) THEN
    RETURN true;
  END IF;

  _start := (_day->>'start')::TIME;
  _end := (_day->>'end')::TIME;

  IF _now_time < _start OR _now_time > _end THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

-- Permite que clientes autenticados executem (apenas leitura, sem efeitos)
GRANT EXECUTE ON FUNCTION public.is_off_business_hours_at(jsonb, jsonb, timestamptz) TO authenticated, service_role, anon;

-- Refatora a versão original para delegar à pura
CREATE OR REPLACE FUNCTION public.is_off_business_hours(_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _bh JSONB;
  _holidays JSONB;
BEGIN
  SELECT business_hours, holidays INTO _bh, _holidays
  FROM public.attendance_settings WHERE company_id = _company_id;

  RETURN public.is_off_business_hours_at(_bh, _holidays, now());
END;
$function$;