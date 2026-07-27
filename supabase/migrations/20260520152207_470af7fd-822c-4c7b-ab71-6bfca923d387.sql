CREATE OR REPLACE FUNCTION public.prevent_lead_create_in_closed_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_type public.pipeline_stage_type;
BEGIN
  IF NEW.stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT stage_type INTO v_type
  FROM public.pipeline_stages
  WHERE id = NEW.stage_id;

  IF v_type IN ('won','lost') THEN
    RAISE EXCEPTION 'Não é permitido criar leads em etapas de Ganho ou Perda. Selecione uma etapa aberta.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_lead_create_in_closed_stage ON public.leads;
CREATE TRIGGER trg_prevent_lead_create_in_closed_stage
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.prevent_lead_create_in_closed_stage();