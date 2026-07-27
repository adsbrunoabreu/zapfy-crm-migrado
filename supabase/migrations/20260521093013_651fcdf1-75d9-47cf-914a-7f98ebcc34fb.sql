
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS value_manual_override boolean NOT NULL DEFAULT false;

DROP TRIGGER IF EXISTS trg_detect_manual_value_edit ON public.leads;

CREATE OR REPLACE FUNCTION public.recalc_lead_value_from_procedures()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_lead_id uuid;
  v_total numeric;
  v_override boolean;
BEGIN
  v_lead_id := COALESCE(NEW.lead_id, OLD.lead_id);

  SELECT value_manual_override INTO v_override
  FROM public.leads WHERE id = v_lead_id;

  IF v_override IS TRUE THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(price_snapshot), 0) INTO v_total
  FROM public.lead_procedures
  WHERE lead_id = v_lead_id;

  UPDATE public.leads
  SET value = NULLIF(v_total, 0),
      value_auto = true
  WHERE id = v_lead_id
    AND (value IS DISTINCT FROM NULLIF(v_total, 0) OR value_auto IS DISTINCT FROM true);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.propagate_procedure_base_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.base_price IS NOT DISTINCT FROM OLD.base_price THEN
    RETURN NEW;
  END IF;

  UPDATE public.lead_procedures lp
  SET price_snapshot = NEW.base_price
  FROM public.leads l
  WHERE lp.medical_procedure_id = NEW.id
    AND lp.lead_id = l.id
    AND COALESCE(l.status, 'new') NOT IN ('won', 'lost')
    AND lp.price_snapshot IS DISTINCT FROM NEW.base_price;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_propagate_procedure_base_price ON public.medical_procedures;
CREATE TRIGGER trg_propagate_procedure_base_price
AFTER UPDATE OF base_price ON public.medical_procedures
FOR EACH ROW
EXECUTE FUNCTION public.propagate_procedure_base_price();

WITH sums AS (
  SELECT lead_id, SUM(price_snapshot) AS s
  FROM public.lead_procedures
  GROUP BY lead_id
)
UPDATE public.leads l
SET value = NULLIF(s.s, 0),
    value_auto = true
FROM sums s
WHERE l.id = s.lead_id
  AND l.value_manual_override = false
  AND (l.value IS DISTINCT FROM NULLIF(s.s, 0) OR l.value_auto IS DISTINCT FROM true);

CREATE OR REPLACE FUNCTION public.get_pipeline_totals(
  p_pipeline_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to   timestamptz DEFAULT NULL
)
RETURNS TABLE (
  stage_id uuid,
  stage_name text,
  stage_position int,
  stage_type text,
  count_total bigint,
  sum_total numeric,
  count_open bigint,
  sum_open numeric,
  count_won bigint,
  sum_won numeric,
  count_lost bigint,
  sum_lost numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    s.id,
    s.name,
    s.position,
    s.stage_type::text,
    COUNT(l.id),
    COALESCE(SUM(l.value), 0),
    COUNT(l.id) FILTER (WHERE COALESCE(l.status,'new') NOT IN ('won','lost')),
    COALESCE(SUM(l.value) FILTER (WHERE COALESCE(l.status,'new') NOT IN ('won','lost')), 0),
    COUNT(l.id) FILTER (WHERE l.status = 'won'),
    COALESCE(SUM(l.value) FILTER (WHERE l.status = 'won'), 0),
    COUNT(l.id) FILTER (WHERE l.status = 'lost'),
    COALESCE(SUM(l.value) FILTER (WHERE l.status = 'lost'), 0)
  FROM public.pipeline_stages s
  LEFT JOIN public.leads l
    ON l.stage_id = s.id
   AND (p_date_from IS NULL OR l.created_at >= p_date_from)
   AND (p_date_to   IS NULL OR l.created_at <= p_date_to)
  WHERE s.pipeline_id = p_pipeline_id
  GROUP BY s.id, s.name, s.position, s.stage_type
  ORDER BY s.position ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_pipeline_totals(uuid, timestamptz, timestamptz) TO authenticated;
