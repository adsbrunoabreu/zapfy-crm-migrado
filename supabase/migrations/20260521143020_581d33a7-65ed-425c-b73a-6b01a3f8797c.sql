
CREATE OR REPLACE FUNCTION public.get_financial_dashboard(
  _company_id uuid,
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL,
  _pipeline_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text := 'America/Sao_Paulo';
  v_today date := (now() AT TIME ZONE v_tz)::date;
  v_from date := COALESCE(_date_from, v_today - INTERVAL '29 days');
  v_to   date := COALESCE(_date_to,   v_today);
  v_span int  := GREATEST(1, (v_to - v_from) + 1);
  v_prev_to   date := v_from - 1;
  v_prev_from date := v_prev_to - (v_span - 1);

  -- KPIs período atual
  v_won numeric := 0;
  v_lost numeric := 0;
  v_open numeric := 0;
  v_cnt_total int := 0;
  v_cnt_won int := 0;
  v_cnt_lost int := 0;
  v_cnt_open int := 0;
  v_received numeric := 0;
  v_to_receive numeric := 0;
  v_paid_out numeric := 0;
  v_to_pay numeric := 0;

  -- período anterior (para deltas)
  v_won_prev numeric := 0;
  v_received_prev numeric := 0;
  v_paid_out_prev numeric := 0;
  v_cnt_won_prev int := 0;
  v_cnt_closed_prev int := 0;

  v_result jsonb;
BEGIN
  IF NOT public.has_financial_access(_company_id) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  -- ===== Leads do período (por closed_at em SP, fallback created_at) =====
  SELECT
    COALESCE(SUM(CASE WHEN status='won' THEN COALESCE(net_value, value, 0) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN status='lost' THEN COALESCE(value,0) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN status NOT IN ('won','lost') THEN COALESCE(value,0) ELSE 0 END),0),
    COUNT(*),
    COUNT(*) FILTER (WHERE status='won'),
    COUNT(*) FILTER (WHERE status='lost'),
    COUNT(*) FILTER (WHERE status NOT IN ('won','lost'))
  INTO v_won, v_lost, v_open, v_cnt_total, v_cnt_won, v_cnt_lost, v_cnt_open
  FROM public.leads l
  WHERE l.company_id = _company_id
    AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
    AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
    AND (
      (l.status IN ('won','lost') AND (COALESCE(l.closed_at, l.created_at) AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to)
      OR (l.status NOT IN ('won','lost') AND (l.created_at AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to)
    );

  -- período anterior (apenas closed_at - ganhos/perdidos)
  SELECT
    COALESCE(SUM(CASE WHEN status='won' THEN COALESCE(net_value, value, 0) ELSE 0 END),0),
    COUNT(*) FILTER (WHERE status='won'),
    COUNT(*) FILTER (WHERE status IN ('won','lost'))
  INTO v_won_prev, v_cnt_won_prev, v_cnt_closed_prev
  FROM public.leads l
  WHERE l.company_id = _company_id
    AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
    AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
    AND l.status IN ('won','lost')
    AND (COALESCE(l.closed_at, l.created_at) AT TIME ZONE v_tz)::date BETWEEN v_prev_from AND v_prev_to;

  -- ===== Entries do período =====
  SELECT
    COALESCE(SUM(CASE WHEN kind='receivable' AND status='paid' AND (paid_at AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to THEN paid_amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN kind='receivable' AND status IN ('pending','partial','overdue') THEN (net_amount - paid_amount) ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN kind='payable' AND status='paid' AND (paid_at AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to THEN paid_amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN kind='payable' AND status IN ('pending','partial','overdue') THEN (net_amount - paid_amount) ELSE 0 END),0)
  INTO v_received, v_to_receive, v_paid_out, v_to_pay
  FROM public.financial_entries
  WHERE company_id = _company_id;

  -- prev period entries
  SELECT
    COALESCE(SUM(CASE WHEN kind='receivable' AND status='paid' AND (paid_at AT TIME ZONE v_tz)::date BETWEEN v_prev_from AND v_prev_to THEN paid_amount ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN kind='payable' AND status='paid' AND (paid_at AT TIME ZONE v_tz)::date BETWEEN v_prev_from AND v_prev_to THEN paid_amount ELSE 0 END),0)
  INTO v_received_prev, v_paid_out_prev
  FROM public.financial_entries
  WHERE company_id = _company_id;

  WITH
  -- Fluxo de caixa diário (recebido vs pago)
  cashflow AS (
    SELECT
      d::date AS day,
      COALESCE(SUM(CASE WHEN fe.kind='receivable' AND fe.status='paid' AND (fe.paid_at AT TIME ZONE v_tz)::date = d::date THEN fe.paid_amount END),0) AS received,
      COALESCE(SUM(CASE WHEN fe.kind='payable'    AND fe.status='paid' AND (fe.paid_at AT TIME ZONE v_tz)::date = d::date THEN fe.paid_amount END),0) AS paid_out
    FROM generate_series(v_from, v_to, INTERVAL '1 day') d
    LEFT JOIN public.financial_entries fe
      ON fe.company_id = _company_id
     AND fe.status = 'paid'
     AND (fe.paid_at AT TIME ZONE v_tz)::date = d::date
    GROUP BY d
    ORDER BY d
  ),
  -- Funil de receita do pipeline (snapshot atual filtrado)
  funnel AS (
    SELECT
      l.status::text AS status,
      COALESCE(SUM(COALESCE(l.net_value, l.value, 0)),0) AS value,
      COUNT(*) AS count
    FROM public.leads l
    WHERE l.company_id = _company_id
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
      AND (l.created_at AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to
    GROUP BY l.status
  ),
  -- Receita por categoria (entries pagos receivable)
  by_category AS (
    SELECT
      COALESCE(fc.name, 'Sem categoria') AS name,
      COALESCE(fc.color, '#64748b') AS color,
      SUM(fe.paid_amount) AS value
    FROM public.financial_entries fe
    LEFT JOIN public.financial_categories fc ON fc.id = fe.category_id
    WHERE fe.company_id = _company_id
      AND fe.kind='receivable' AND fe.status='paid'
      AND (fe.paid_at AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to
    GROUP BY fc.name, fc.color
    ORDER BY value DESC
    LIMIT 8
  ),
  -- Aging de recebíveis (snapshot atual, independente do período)
  aging AS (
    SELECT
      CASE
        WHEN due_date IS NULL THEN 'sem_vencimento'
        WHEN due_date >= v_today THEN 'a_vencer'
        WHEN (v_today - due_date) BETWEEN 1 AND 7 THEN 'd1_7'
        WHEN (v_today - due_date) BETWEEN 8 AND 30 THEN 'd8_30'
        WHEN (v_today - due_date) BETWEEN 31 AND 60 THEN 'd31_60'
        ELSE 'd60_plus'
      END AS bucket,
      SUM(net_amount - paid_amount) AS value,
      COUNT(*) AS count
    FROM public.financial_entries
    WHERE company_id = _company_id
      AND kind='receivable'
      AND status IN ('pending','partial','overdue')
    GROUP BY bucket
  ),
  -- Top 10 clientes por receita (entries pagos no período)
  top_customers AS (
    SELECT
      COALESCE(c.name, fe.party_name, 'Sem nome') AS name,
      COALESCE(fe.contact_id::text, fe.party_name, '—') AS key,
      SUM(fe.paid_amount) AS value,
      COUNT(*) AS count
    FROM public.financial_entries fe
    LEFT JOIN public.contacts c ON c.id = fe.contact_id
    WHERE fe.company_id = _company_id
      AND fe.kind='receivable' AND fe.status='paid'
      AND (fe.paid_at AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to
    GROUP BY key, name
    ORDER BY value DESC
    LIMIT 10
  ),
  -- Próximos vencimentos (7 dias a partir de hoje)
  upcoming AS (
    SELECT
      fe.id,
      fe.kind,
      fe.description,
      fe.due_date,
      (fe.net_amount - fe.paid_amount) AS amount,
      COALESCE(c.name, fe.party_name) AS party_name,
      fe.status
    FROM public.financial_entries fe
    LEFT JOIN public.contacts c ON c.id = fe.contact_id
    WHERE fe.company_id = _company_id
      AND fe.status IN ('pending','partial','overdue')
      AND fe.due_date IS NOT NULL
      AND fe.due_date BETWEEN v_today AND (v_today + INTERVAL '7 days')::date
    ORDER BY fe.due_date ASC
    LIMIT 15
  ),
  -- Performance por responsável
  owners AS (
    SELECT
      l.assigned_to AS user_id,
      COALESCE(p.full_name, p.email, 'Sem responsável') AS name,
      COALESCE(SUM(CASE WHEN l.status='won' THEN COALESCE(l.net_value, l.value, 0) ELSE 0 END),0) AS won_value,
      COUNT(*) FILTER (WHERE l.status='won') AS won_count,
      COUNT(*) FILTER (WHERE l.status IN ('won','lost')) AS closed_count
    FROM public.leads l
    LEFT JOIN public.profiles p ON p.id = l.assigned_to
    WHERE l.company_id = _company_id
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND l.status IN ('won','lost')
      AND (COALESCE(l.closed_at, l.created_at) AT TIME ZONE v_tz)::date BETWEEN v_from AND v_to
    GROUP BY l.assigned_to, p.full_name, p.email
    ORDER BY won_value DESC
    LIMIT 10
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to, 'prev_from', v_prev_from, 'prev_to', v_prev_to),
    'kpis', jsonb_build_object(
      'revenue_won',      v_won,
      'revenue_won_prev', v_won_prev,
      'received',         v_received,
      'received_prev',    v_received_prev,
      'to_receive',       v_to_receive,
      'paid_out',         v_paid_out,
      'paid_out_prev',    v_paid_out_prev,
      'to_pay',           v_to_pay,
      'net_profit',       (v_received - v_paid_out),
      'net_profit_prev',  (v_received_prev - v_paid_out_prev),
      'margin_pct',       CASE WHEN v_received > 0 THEN ROUND(((v_received - v_paid_out) / v_received * 100)::numeric, 1) ELSE 0 END,
      'avg_ticket',       CASE WHEN v_cnt_won > 0 THEN ROUND((v_won / v_cnt_won)::numeric, 2) ELSE 0 END,
      'avg_ticket_prev',  CASE WHEN v_cnt_won_prev > 0 THEN ROUND((v_won_prev / v_cnt_won_prev)::numeric, 2) ELSE 0 END,
      'win_rate',         CASE WHEN (v_cnt_won + v_cnt_lost) > 0 THEN ROUND((v_cnt_won::numeric / (v_cnt_won + v_cnt_lost) * 100), 1) ELSE 0 END,
      'win_rate_prev',    CASE WHEN v_cnt_closed_prev > 0 THEN ROUND((v_cnt_won_prev::numeric / v_cnt_closed_prev * 100), 1) ELSE 0 END,
      'count_total',      v_cnt_total,
      'count_won',        v_cnt_won,
      'count_lost',       v_cnt_lost,
      'count_open',       v_cnt_open,
      'open_value',       v_open,
      'lost_value',       v_lost
    ),
    'cashflow',      COALESCE((SELECT jsonb_agg(jsonb_build_object('day', day, 'received', received, 'paid_out', paid_out)) FROM cashflow), '[]'::jsonb),
    'funnel',        COALESCE((SELECT jsonb_agg(jsonb_build_object('status', status, 'value', value, 'count', count)) FROM funnel), '[]'::jsonb),
    'by_category',   COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'color', color, 'value', value)) FROM by_category), '[]'::jsonb),
    'aging',         COALESCE((SELECT jsonb_agg(jsonb_build_object('bucket', bucket, 'value', value, 'count', count)) FROM aging), '[]'::jsonb),
    'top_customers', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'value', value, 'count', count)) FROM top_customers), '[]'::jsonb),
    'upcoming',      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'description', description, 'due_date', due_date, 'amount', amount, 'party_name', party_name, 'status', status)) FROM upcoming), '[]'::jsonb),
    'owners',        COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', user_id, 'name', name, 'won_value', won_value, 'won_count', won_count, 'closed_count', closed_count)) FROM owners), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_financial_dashboard(uuid, date, date, uuid, uuid) TO authenticated;
