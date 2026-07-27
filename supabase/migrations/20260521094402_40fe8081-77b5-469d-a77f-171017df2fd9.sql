
-- Auto move lead to won/lost stage when status changes
CREATE OR REPLACE FUNCTION public.sync_lead_stage_from_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pipeline uuid;
  v_target_stage uuid;
  v_current_type public.pipeline_stage_type;
  v_target_type public.pipeline_stage_type;
BEGIN
  -- Apenas quando status muda
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('won'::lead_status, 'lost'::lead_status) THEN
    RETURN NEW;
  END IF;

  v_target_type := CASE WHEN NEW.status = 'won'::lead_status THEN 'won' ELSE 'lost' END::public.pipeline_stage_type;

  -- Se já está numa etapa do tipo certo, nada a fazer
  IF NEW.stage_id IS NOT NULL THEN
    SELECT stage_type INTO v_current_type FROM public.pipeline_stages WHERE id = NEW.stage_id;
    IF v_current_type = v_target_type THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Descobre pipeline atual
  v_pipeline := NEW.pipeline_id;
  IF v_pipeline IS NULL AND NEW.stage_id IS NOT NULL THEN
    SELECT pipeline_id INTO v_pipeline FROM public.pipeline_stages WHERE id = NEW.stage_id;
  END IF;

  IF v_pipeline IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_target_stage
  FROM public.pipeline_stages
  WHERE pipeline_id = v_pipeline AND stage_type = v_target_type
  ORDER BY position ASC
  LIMIT 1;

  IF v_target_stage IS NOT NULL THEN
    NEW.stage_id := v_target_stage;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_stage_from_status ON public.leads;
CREATE TRIGGER trg_sync_lead_stage_from_status
BEFORE UPDATE OF status ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.sync_lead_stage_from_status();
