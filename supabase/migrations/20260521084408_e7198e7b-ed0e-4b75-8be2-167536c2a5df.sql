
-- 1) price_snapshot em lead_procedures
ALTER TABLE public.lead_procedures
  ADD COLUMN IF NOT EXISTS price_snapshot numeric;

-- 2) value_auto em leads (default true em medical, mas seguro como true sempre — só age via trigger se houver lead_procedures)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS value_auto boolean NOT NULL DEFAULT true;

-- 3) Trigger BEFORE INSERT em lead_procedures: copia base_price se não informado
CREATE OR REPLACE FUNCTION public.lead_procedures_set_price_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.price_snapshot IS NULL THEN
    SELECT mp.base_price INTO NEW.price_snapshot
    FROM public.medical_procedures mp
    WHERE mp.id = NEW.medical_procedure_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_procedures_set_price ON public.lead_procedures;
CREATE TRIGGER trg_lead_procedures_set_price
  BEFORE INSERT ON public.lead_procedures
  FOR EACH ROW EXECUTE FUNCTION public.lead_procedures_set_price_snapshot();

-- 4) Trigger AFTER INSERT/UPDATE/DELETE em lead_procedures: recalcula leads.value se value_auto
CREATE OR REPLACE FUNCTION public.recalc_lead_value_from_procedures()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
  v_total numeric;
  v_auto boolean;
BEGIN
  v_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);
  SELECT value_auto INTO v_auto FROM public.leads WHERE id = v_lead_id;
  IF v_auto IS DISTINCT FROM true THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(price_snapshot), 0) INTO v_total
  FROM public.lead_procedures
  WHERE lead_id = v_lead_id;

  -- Atualiza sem disparar o trigger de "edição manual" (usar coluna value_auto inalterada)
  UPDATE public.leads
  SET value = NULLIF(v_total, 0)
  WHERE id = v_lead_id
    AND value IS DISTINCT FROM NULLIF(v_total, 0);

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_lead_value_ins ON public.lead_procedures;
CREATE TRIGGER trg_recalc_lead_value_ins
  AFTER INSERT OR DELETE OR UPDATE OF price_snapshot, medical_procedure_id ON public.lead_procedures
  FOR EACH ROW EXECUTE FUNCTION public.recalc_lead_value_from_procedures();

-- 5) Trigger BEFORE UPDATE em leads: se o usuário editar `value` manualmente e o valor não bater com a soma, marca value_auto=false
CREATE OR REPLACE FUNCTION public.detect_manual_value_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum numeric;
BEGIN
  -- só age quando value mudou
  IF NEW.value IS NOT DISTINCT FROM OLD.value THEN
    RETURN NEW;
  END IF;

  -- soma dos procedimentos
  SELECT COALESCE(SUM(price_snapshot), 0) INTO v_sum
  FROM public.lead_procedures
  WHERE lead_id = NEW.id;

  -- se há procedimentos e o novo valor difere da soma, é edição manual
  IF v_sum > 0 AND NEW.value IS DISTINCT FROM NULLIF(v_sum, 0) THEN
    NEW.value_auto := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_detect_manual_value_edit ON public.leads;
CREATE TRIGGER trg_detect_manual_value_edit
  BEFORE UPDATE OF value ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.detect_manual_value_edit();

-- 6) Backfill: para registros existentes sem price_snapshot, copiar base_price
UPDATE public.lead_procedures lp
SET price_snapshot = mp.base_price
FROM public.medical_procedures mp
WHERE lp.medical_procedure_id = mp.id
  AND lp.price_snapshot IS NULL;

-- 7) Backfill: recalcular leads.value para leads com procedimentos (apenas se value_auto=true)
WITH sums AS (
  SELECT lead_id, SUM(price_snapshot) AS total
  FROM public.lead_procedures
  WHERE price_snapshot IS NOT NULL
  GROUP BY lead_id
)
UPDATE public.leads l
SET value = NULLIF(s.total, 0)
FROM sums s
WHERE l.id = s.lead_id
  AND l.value_auto = true
  AND l.value IS DISTINCT FROM NULLIF(s.total, 0);
