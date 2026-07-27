-- 1. Enum stage_type
DO $$ BEGIN
  CREATE TYPE public.pipeline_stage_type AS ENUM ('open','won','lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Coluna em pipeline_stages
ALTER TABLE public.pipeline_stages
  ADD COLUMN IF NOT EXISTS stage_type public.pipeline_stage_type NOT NULL DEFAULT 'open';

-- 3. Backfill por nome
UPDATE public.pipeline_stages
SET stage_type = 'won'
WHERE stage_type = 'open'
  AND (
    name ILIKE 'fechad%' OR name ILIKE 'ganh%' OR name ILIKE 'won%'
    OR name ILIKE '%vendido%' OR name ILIKE '%concluído%' OR name ILIKE '%concluido%'
  );

UPDATE public.pipeline_stages
SET stage_type = 'lost'
WHERE stage_type = 'open'
  AND (
    name ILIKE 'perdid%' OR name ILIKE 'lost%' OR name ILIKE '%cancelad%' OR name ILIKE '%desistên%' OR name ILIKE '%desisten%'
  );

-- 4. Trigger: sincroniza leads.status quando stage_id muda
CREATE OR REPLACE FUNCTION public.sync_lead_status_from_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type public.pipeline_stage_type;
BEGIN
  IF NEW.stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT stage_type INTO v_type
  FROM public.pipeline_stages
  WHERE id = NEW.stage_id;

  IF v_type = 'won' THEN
    NEW.status := 'won'::lead_status;
  ELSIF v_type = 'lost' THEN
    NEW.status := 'lost'::lead_status;
  ELSE
    -- voltou para etapa aberta: se estava terminal, reabrir como 'new'
    IF TG_OP = 'UPDATE' AND OLD.status IN ('won'::lead_status, 'lost'::lead_status) THEN
      NEW.status := 'new'::lead_status;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_status_from_stage ON public.leads;
CREATE TRIGGER trg_sync_lead_status_from_stage
BEFORE INSERT OR UPDATE OF stage_id ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.sync_lead_status_from_stage();

-- 5. Backfill leads atuais
UPDATE public.leads l
SET status = CASE ps.stage_type
  WHEN 'won' THEN 'won'::lead_status
  WHEN 'lost' THEN 'lost'::lead_status
  ELSE l.status
END
FROM public.pipeline_stages ps
WHERE ps.id = l.stage_id
  AND (
    (ps.stage_type = 'won' AND l.status <> 'won'::lead_status)
    OR (ps.stage_type = 'lost' AND l.status <> 'lost'::lead_status)
  );