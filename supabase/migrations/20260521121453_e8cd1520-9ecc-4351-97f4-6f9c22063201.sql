CREATE OR REPLACE FUNCTION public.set_lead_tenant_seq()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_seq integer;
BEGIN
  IF NEW.tenant_seq IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Advisory lock por empresa para evitar corrida ao calcular próximo seq
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.company_id::text, 0));

  SELECT COALESCE(MAX(tenant_seq), 0) + 1
    INTO next_seq
    FROM public.leads
    WHERE company_id = NEW.company_id;

  NEW.tenant_seq := next_seq;
  RETURN NEW;
END;
$function$;