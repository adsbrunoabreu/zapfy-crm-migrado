
CREATE OR REPLACE FUNCTION public.list_lead_budgets(
  _period_start date,
  _period_end date,
  _pipeline_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _order_by text DEFAULT 'created_at',
  _order_dir text DEFAULT 'desc',
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0,
  _status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_total int;
  v_items jsonb;
  v_ob text;
  v_od text;
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();
  IF NOT public.has_financial_access(v_company) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_ob := CASE lower(coalesce(_order_by,'created_at'))
            WHEN 'value' THEN 'value'
            WHEN 'net_value' THEN 'net_value'
            WHEN 'payment_method' THEN 'payment_method'
            WHEN 'pipeline_name' THEN 'pipeline_name'
            WHEN 'stage_name' THEN 'stage_name'
            WHEN 'name' THEN 'name'
            WHEN 'numeric_id' THEN 'numeric_id'
            WHEN 'payment_confirmed_at' THEN 'payment_confirmed_at'
            WHEN 'invoice_number' THEN 'invoice_number'
            WHEN 'assigned_to_name' THEN 'assigned_to_name'
            ELSE 'created_at'
          END;
  v_od := CASE lower(coalesce(_order_dir,'desc')) WHEN 'asc' THEN 'asc' ELSE 'desc' END;

  WITH base AS (
    SELECT l.id
    FROM public.leads l
    WHERE l.company_id = v_company
      AND l.created_at::date BETWEEN _period_start AND _period_end
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
      AND (_status IS NULL OR _status = '' OR _status = 'all' OR l.status::text = _status)
      AND (
        _search IS NULL OR _search = ''
        OR l.name ILIKE '%'||_search||'%'
        OR l.numeric_id::text = _search
      )
  )
  SELECT COUNT(*) INTO v_total FROM base;

  EXECUTE format($q$
    SELECT coalesce(jsonb_agg(to_jsonb(b.*)), '[]'::jsonb)
    FROM (
      SELECT l.id, l.numeric_id, l.name, l.status::text AS status, l.value, l.discount_pct, l.discount_amount,
             l.net_value, l.payment_method, l.payment_installments,
             l.payment_reference, l.payment_confirmed_at, l.invoice_number, l.finance_notes,
             l.assigned_to, l.pipeline_id, l.stage_id, l.created_at,
             p.name AS pipeline_name,
             ps.name AS stage_name, ps.color AS stage_color, ps.stage_type AS stage_type,
             pr.full_name AS assigned_to_name,
             (SELECT count(*) FROM public.lead_payment_attachments a WHERE a.lead_id = l.id) AS attachments_count
      FROM public.leads l
      LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
      LEFT JOIN public.pipeline_stages ps ON ps.id = l.stage_id
      LEFT JOIN public.profiles pr ON pr.id = l.assigned_to
      WHERE l.company_id = %L
        AND l.created_at::date BETWEEN %L AND %L
        AND (%L::uuid IS NULL OR l.pipeline_id = %L)
        AND (%L::uuid IS NULL OR l.assigned_to = %L)
        AND (%L IS NULL OR %L = '' OR %L = 'all' OR l.status::text = %L)
        AND (
          %L IS NULL OR %L = ''
          OR l.name ILIKE '%%'||%L||'%%'
          OR l.numeric_id::text = %L
        )
      ORDER BY %I %s NULLS LAST, l.id DESC
      LIMIT %s OFFSET %s
    ) b
  $q$,
    v_company, _period_start, _period_end,
    _pipeline_id, _pipeline_id,
    _assigned_to, _assigned_to,
    _status, _status, _status, _status,
    _search, _search, _search, _search,
    v_ob, v_od, _limit, _offset
  ) INTO v_items;

  RETURN jsonb_build_object('total', v_total, 'items', v_items);
END;
$function$;
