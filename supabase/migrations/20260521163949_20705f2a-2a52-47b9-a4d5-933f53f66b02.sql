CREATE OR REPLACE FUNCTION public.get_budget_overview(_period_start date, _period_end date, _pipeline_id uuid DEFAULT NULL::uuid, _assigned_to uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_days int;
  v_prev_start date;
  v_prev_end date;
  v_current jsonb;
  v_previous jsonb;
  v_win_rate numeric;
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();
  IF v_company IS NULL AND NOT public.has_role(auth.uid(),'master'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.has_financial_access(v_company) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_days := GREATEST((_period_end - _period_start) + 1, 1);
  v_prev_end := _period_start - 1;
  v_prev_start := v_prev_end - (v_days - 1);

  -- win-rate: leads FECHADOS no período (axis closed_at). 0 quando não há histórico.
  SELECT CASE WHEN COUNT(*) FILTER (WHERE public.lead_is_closed(l.status, s.stage_type::text)) = 0 THEN 0
              ELSE COUNT(*) FILTER (WHERE public.lead_is_won(l.status, s.stage_type::text))::numeric
                 / COUNT(*) FILTER (WHERE public.lead_is_closed(l.status, s.stage_type::text)) END
    INTO v_win_rate
  FROM public.leads l
  LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
  WHERE l.company_id = v_company
    AND COALESCE(l.is_demo,false) = false
    AND l.closed_at IS NOT NULL
    AND l.closed_at::date BETWEEN _period_start AND _period_end
    AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
    AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to);

  WITH base AS (
    SELECT l.*, s.stage_type::text AS stage_type
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = v_company
      AND COALESCE(l.is_demo,false) = false
      AND l.pipeline_id IS NOT NULL
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
  ),
  open_set AS (
    SELECT * FROM base WHERE NOT public.lead_is_closed(status, stage_type)
  ),
  closed_set AS (
    SELECT * FROM base WHERE closed_at IS NOT NULL AND closed_at::date BETWEEN _period_start AND _period_end
  ),
  agg AS (
    SELECT
      (SELECT COUNT(*) FROM base)                                                            AS count_total,
      (SELECT COUNT(*) FROM closed_set WHERE public.lead_is_won(status,stage_type))          AS count_won,
      (SELECT COUNT(*) FROM closed_set WHERE public.lead_is_lost(status,stage_type))         AS count_lost,
      (SELECT COUNT(*) FROM open_set)                                                        AS count_open,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM base)        AS total_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_won(status,stage_type))  AS won_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_lost(status,stage_type)) AS lost_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM open_set)    AS open_value,
      (SELECT COALESCE(AVG(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_won(status,stage_type))  AS avg_ticket,
      (SELECT COALESCE(SUM(COALESCE(discount_amount, COALESCE(value,0)*COALESCE(discount_pct,0)/100, 0)),0) FROM closed_set WHERE public.lead_is_won(status,stage_type)) AS discount_total
  ),
  fin AS (
    SELECT COALESCE(SUM(paid_amount),0) AS gross_revenue
    FROM public.financial_entries
    WHERE company_id = v_company
      AND kind = 'receivable'
      AND status = 'paid'
      AND paid_at::date BETWEEN _period_start AND _period_end
  )
  SELECT jsonb_build_object(
    'count_total', a.count_total,
    'count_won', a.count_won,
    'count_lost', a.count_lost,
    'count_open', a.count_open,
    'total_value', a.total_value,
    'won_value', a.won_value,
    'lost_value', a.lost_value,
    'open_value', a.open_value,
    'avg_ticket', a.avg_ticket,
    'projection', a.open_value * v_win_rate,
    'gross_revenue', f.gross_revenue,
    'discount_total', a.discount_total
  ) INTO v_current FROM agg a, fin f;

  -- Período anterior: total_value/open_value são lifetime (sem variação por janela);
  -- somente won/lost/avg_ticket variam pelo período anterior.
  WITH base AS (
    SELECT l.*, s.stage_type::text AS stage_type
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = v_company
      AND COALESCE(l.is_demo,false) = false
      AND l.pipeline_id IS NOT NULL
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
  ),
  open_set AS (
    SELECT * FROM base WHERE NOT public.lead_is_closed(status, stage_type)
  ),
  closed_set AS (
    SELECT * FROM base WHERE closed_at IS NOT NULL AND closed_at::date BETWEEN v_prev_start AND v_prev_end
  ),
  agg AS (
    SELECT
      (SELECT COUNT(*) FROM base) AS count_total,
      (SELECT COUNT(*) FROM closed_set WHERE public.lead_is_won(status,stage_type))  AS count_won,
      (SELECT COUNT(*) FROM closed_set WHERE public.lead_is_lost(status,stage_type)) AS count_lost,
      (SELECT COUNT(*) FROM open_set) AS count_open,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM base) AS total_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_won(status,stage_type))  AS won_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_lost(status,stage_type)) AS lost_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM open_set) AS open_value,
      (SELECT COALESCE(AVG(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_won(status,stage_type))  AS avg_ticket,
      (SELECT COALESCE(SUM(COALESCE(discount_amount, COALESCE(value,0)*COALESCE(discount_pct,0)/100, 0)),0) FROM closed_set WHERE public.lead_is_won(status,stage_type)) AS discount_total
  ),
  fin AS (
    SELECT COALESCE(SUM(paid_amount),0) AS gross_revenue
    FROM public.financial_entries
    WHERE company_id = v_company
      AND kind = 'receivable'
      AND status = 'paid'
      AND paid_at::date BETWEEN v_prev_start AND v_prev_end
  )
  SELECT jsonb_build_object(
    'count_total', a.count_total,
    'count_won', a.count_won,
    'count_lost', a.count_lost,
    'count_open', a.count_open,
    'total_value', a.total_value,
    'won_value', a.won_value,
    'lost_value', a.lost_value,
    'open_value', a.open_value,
    'avg_ticket', a.avg_ticket,
    'projection', 0,
    'gross_revenue', f.gross_revenue,
    'discount_total', a.discount_total
  ) INTO v_previous FROM agg a, fin f;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', _period_start, 'end', _period_end),
    'previous_period', jsonb_build_object('start', v_prev_start, 'end', v_prev_end),
    'current', v_current,
    'previous', v_previous
  );
END;
$function$;