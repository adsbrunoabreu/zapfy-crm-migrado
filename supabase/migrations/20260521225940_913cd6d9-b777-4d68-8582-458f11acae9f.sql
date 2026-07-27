
CREATE OR REPLACE FUNCTION public.get_dre_report(_company_id uuid, _period_start date, _period_end date, _basis text DEFAULT 'competencia'::text, _filters jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_doctor_id uuid := nullif(_filters->>'doctor_id','')::uuid;
  v_insurance_id uuid := nullif(_filters->>'insurance_id','')::uuid;
  v_facility_id uuid := nullif(_filters->>'facility_id','')::uuid;
  v_category_id uuid := nullif(_filters->>'category_id','')::uuid;
  v_cost_center_id uuid := nullif(_filters->>'cost_center_id','')::uuid;
BEGIN
  IF NOT (has_role(auth.uid(),'master') OR
          EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = _company_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH base AS (
    SELECT
      fe.id, fe.amount, fe.discount, fe.net_amount, fe.paid_amount, fe.status,
      fc.dre_section, fc.name AS category_name, fc.id AS category_id,
      fe.due_date, fe.paid_at, fe.metadata
    FROM public.financial_entries fe
    LEFT JOIN public.financial_categories fc ON fc.id = fe.category_id
    WHERE fe.company_id = _company_id
      AND (
        (_basis = 'competencia' AND fe.due_date BETWEEN _period_start AND _period_end)
        OR (_basis = 'caixa' AND fe.paid_at::date BETWEEN _period_start AND _period_end)
      )
      AND (v_category_id IS NULL OR fc.id = v_category_id)
      AND (v_cost_center_id IS NULL OR fe.cost_center_id = v_cost_center_id)
      AND (v_doctor_id IS NULL OR (fe.metadata->>'doctor_id')::uuid = v_doctor_id)
      AND (v_insurance_id IS NULL OR (fe.metadata->>'insurance_id')::uuid = v_insurance_id)
      AND (v_facility_id IS NULL OR (fe.metadata->>'facility_id')::uuid = v_facility_id)
  ),
  by_section AS (
    SELECT dre_section, SUM(net_amount) AS total
    FROM base WHERE dre_section IS NOT NULL GROUP BY dre_section
  ),
  by_category AS (
    SELECT dre_section, category_id, category_name, SUM(net_amount) AS total, COUNT(*) AS qty
    FROM base WHERE dre_section IS NOT NULL
    GROUP BY dre_section, category_id, category_name
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('start', _period_start, 'end', _period_end, 'basis', _basis),
    'sections', COALESCE((SELECT jsonb_object_agg(dre_section, total) FROM by_section), '{}'::jsonb),
    'categories', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'section', dre_section, 'category_id', category_id,
      'category_name', category_name, 'total', total, 'qty', qty
    ) ORDER BY total DESC) FROM by_category), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END $function$;
