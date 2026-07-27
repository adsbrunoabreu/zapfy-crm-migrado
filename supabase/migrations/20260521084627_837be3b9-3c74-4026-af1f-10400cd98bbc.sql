
CREATE OR REPLACE FUNCTION public.sync_lead_legacy_procedure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_first_proc uuid;
BEGIN
  v_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
  SELECT medical_procedure_id INTO v_first_proc
  FROM public.lead_procedures
  WHERE lead_id = v_lead_id
  ORDER BY created_at ASC
  LIMIT 1;

  UPDATE public.leads
  SET medical_procedure_id = v_first_proc
  WHERE id = v_lead_id
    AND medical_procedure_id IS DISTINCT FROM v_first_proc;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_legacy_procedure ON public.lead_procedures;
CREATE TRIGGER trg_sync_lead_legacy_procedure
  AFTER INSERT OR DELETE ON public.lead_procedures
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_legacy_procedure();

-- Backfill: garantir que leads.medical_procedure_id reflita o primeiro lead_procedure
WITH firsts AS (
  SELECT DISTINCT ON (lead_id) lead_id, medical_procedure_id
  FROM public.lead_procedures
  ORDER BY lead_id, created_at ASC
)
UPDATE public.leads l
SET medical_procedure_id = f.medical_procedure_id
FROM firsts f
WHERE l.id = f.lead_id
  AND l.medical_procedure_id IS DISTINCT FROM f.medical_procedure_id;
