-- Add quantity to lead_procedures
ALTER TABLE public.lead_procedures
  ADD COLUMN IF NOT EXISTS quantity smallint NOT NULL DEFAULT 1;

ALTER TABLE public.lead_procedures
  DROP CONSTRAINT IF EXISTS lead_procedures_quantity_check;
ALTER TABLE public.lead_procedures
  ADD CONSTRAINT lead_procedures_quantity_check CHECK (quantity >= 1 AND quantity <= 999);

-- Recreate net_price generated column to consider quantity
ALTER TABLE public.lead_procedures DROP COLUMN IF EXISTS net_price;
ALTER TABLE public.lead_procedures
  ADD COLUMN net_price numeric GENERATED ALWAYS AS (
    GREATEST(
      (COALESCE(price_snapshot, 0) * COALESCE(quantity, 1))
      - COALESCE(
          discount_amount,
          (COALESCE(price_snapshot, 0) * COALESCE(quantity, 1) * COALESCE(discount_pct, 0)) / 100,
          0
        ),
      0
    )
  ) STORED;

-- Update recalc function to multiply by quantity
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

  SELECT COALESCE(SUM(price_snapshot * COALESCE(quantity, 1)), 0) INTO v_total
  FROM public.lead_procedures
  WHERE lead_id = v_lead_id;

  UPDATE public.leads
  SET value = NULLIF(v_total, 0)
  WHERE id = v_lead_id
    AND value IS DISTINCT FROM NULLIF(v_total, 0);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Update detect manual edit to consider quantity
CREATE OR REPLACE FUNCTION public.detect_manual_value_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum numeric;
BEGIN
  IF NEW.value IS NOT DISTINCT FROM OLD.value THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(price_snapshot * COALESCE(quantity, 1)), 0) INTO v_sum
  FROM public.lead_procedures
  WHERE lead_id = NEW.id;

  IF v_sum > 0 AND NEW.value IS DISTINCT FROM NULLIF(v_sum, 0) THEN
    NEW.value_auto := false;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger now fires on quantity / discount changes too
DROP TRIGGER IF EXISTS trg_recalc_lead_value_ins ON public.lead_procedures;
CREATE TRIGGER trg_recalc_lead_value_ins
  AFTER INSERT OR DELETE OR UPDATE OF price_snapshot, medical_procedure_id, quantity, discount_pct, discount_amount
  ON public.lead_procedures
  FOR EACH ROW EXECUTE FUNCTION public.recalc_lead_value_from_procedures();