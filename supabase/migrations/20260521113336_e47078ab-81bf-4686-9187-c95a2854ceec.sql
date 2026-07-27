
-- ============================================================
-- PACOTE A — Unificar definição de Ganho/Perdido e Receita
-- Helpers canônicos + reescrita das 3 RPCs principais
-- ============================================================

-- 1. HELPERS CANÔNICOS ----------------------------------------------------

-- Classificação Ganho: stage_type vence; cai para leads.status quando estágio não tem tipo
CREATE OR REPLACE FUNCTION public.lead_is_won(_status text, _stage_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(_stage_type = 'won', false)
      OR (_stage_type IS NULL AND _status = 'won');
$$;

CREATE OR REPLACE FUNCTION public.lead_is_lost(_status text, _stage_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(_stage_type = 'lost', false)
      OR (_stage_type IS NULL AND _status = 'lost');
$$;

CREATE OR REPLACE FUNCTION public.lead_is_closed(_status text, _stage_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT public.lead_is_won(_status,_stage_type) OR public.lead_is_lost(_status,_stage_type);
$$;

-- Valor realizado: net_value (líquido) quando preenchido, senão value (bruto)
CREATE OR REPLACE FUNCTION public.lead_realized_value(_value numeric, _net_value numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(_net_value, _value, 0);
$$;

-- 2. REESCRITA get_budget_overview ---------------------------------------
-- Eixo created_at -> total/open
-- Eixo closed_at  -> won/lost/avg_ticket
-- is_demo=false aplicado
-- gross_revenue continua sendo financial_entries.paid_amount (caixa)
CREATE OR REPLACE FUNCTION public.get_budget_overview(
  _period_start date,
  _period_end date,
  _pipeline_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
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
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
  ),
  created AS (
    SELECT * FROM base WHERE created_at::date BETWEEN _period_start AND _period_end
  ),
  closed_set AS (
    SELECT * FROM base WHERE closed_at IS NOT NULL AND closed_at::date BETWEEN _period_start AND _period_end
  ),
  agg AS (
    SELECT
      (SELECT COUNT(*) FROM created)                                                        AS count_total,
      (SELECT COUNT(*) FROM closed_set WHERE public.lead_is_won(status,stage_type))         AS count_won,
      (SELECT COUNT(*) FROM closed_set WHERE public.lead_is_lost(status,stage_type))        AS count_lost,
      (SELECT COUNT(*) FROM created    WHERE NOT public.lead_is_closed(status,stage_type))  AS count_open,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM created)    AS total_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_won(status,stage_type))  AS won_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_lost(status,stage_type)) AS lost_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM created    WHERE NOT public.lead_is_closed(status,stage_type)) AS open_value,
      (SELECT COALESCE(AVG(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_won(status,stage_type))  AS avg_ticket,
      (SELECT COALESCE(SUM(COALESCE(discount_amount, COALESCE(value,0)*COALESCE(discount_pct,0)/100, 0)),0) FROM created) AS discount_total
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

  -- Período anterior
  WITH base AS (
    SELECT l.*, s.stage_type::text AS stage_type
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = v_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
  ),
  created AS (
    SELECT * FROM base WHERE created_at::date BETWEEN v_prev_start AND v_prev_end
  ),
  closed_set AS (
    SELECT * FROM base WHERE closed_at IS NOT NULL AND closed_at::date BETWEEN v_prev_start AND v_prev_end
  ),
  agg AS (
    SELECT
      (SELECT COUNT(*) FROM created) AS count_total,
      (SELECT COUNT(*) FROM closed_set WHERE public.lead_is_won(status,stage_type)) AS count_won,
      (SELECT COUNT(*) FROM closed_set WHERE public.lead_is_lost(status,stage_type)) AS count_lost,
      (SELECT COUNT(*) FROM created WHERE NOT public.lead_is_closed(status,stage_type)) AS count_open,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM created) AS total_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_won(status,stage_type)) AS won_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_lost(status,stage_type)) AS lost_value,
      (SELECT COALESCE(SUM(public.lead_realized_value(value,net_value)),0) FROM created WHERE NOT public.lead_is_closed(status,stage_type)) AS open_value,
      (SELECT COALESCE(AVG(public.lead_realized_value(value,net_value)),0) FROM closed_set WHERE public.lead_is_won(status,stage_type)) AS avg_ticket,
      (SELECT COALESCE(SUM(COALESCE(discount_amount, COALESCE(value,0)*COALESCE(discount_pct,0)/100, 0)),0) FROM created) AS discount_total
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
$$;

-- 3. REESCRITA get_financial_overview ------------------------------------
-- Mesma classificação canônica. Eixo closed_at para won/lost. is_demo=false.
-- Acrescenta won_revenue (realizado, axis closed_at) para casar com Dashboard.
CREATE OR REPLACE FUNCTION public.get_financial_overview(
  _company_id uuid,
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL,
  _pipeline_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  v_total numeric := 0;
  v_won numeric := 0;
  v_lost numeric := 0;
  v_open numeric := 0;
  v_count_total int := 0;
  v_count_won int := 0;
  v_count_lost int := 0;
  v_count_open int := 0;
  v_receivable_pending numeric := 0;
  v_receivable_paid numeric := 0;
  v_payable_pending numeric := 0;
  v_payable_paid numeric := 0;
BEGIN
  IF NOT public.has_financial_access(_company_id) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  -- created_at axis: total/open (leads criados no período)
  -- closed_at axis: won/lost (leads fechados no período)
  WITH base AS (
    SELECT l.*, s.stage_type::text AS stage_type
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _company_id
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
  ),
  created AS (
    SELECT * FROM base WHERE (_date_from IS NULL OR created_at::date >= _date_from)
                         AND (_date_to   IS NULL OR created_at::date <= _date_to)
  ),
  closed_set AS (
    SELECT * FROM base WHERE closed_at IS NOT NULL
                         AND (_date_from IS NULL OR closed_at::date >= _date_from)
                         AND (_date_to   IS NULL OR closed_at::date <= _date_to)
  )
  SELECT
    COALESCE((SELECT SUM(public.lead_realized_value(value,net_value)) FROM created),0),
    COALESCE((SELECT SUM(public.lead_realized_value(value,net_value)) FROM closed_set WHERE public.lead_is_won(status,stage_type)),0),
    COALESCE((SELECT SUM(public.lead_realized_value(value,net_value)) FROM closed_set WHERE public.lead_is_lost(status,stage_type)),0),
    COALESCE((SELECT SUM(public.lead_realized_value(value,net_value)) FROM created WHERE NOT public.lead_is_closed(status,stage_type)),0),
    (SELECT COUNT(*) FROM created),
    (SELECT COUNT(*) FROM closed_set WHERE public.lead_is_won(status,stage_type)),
    (SELECT COUNT(*) FROM closed_set WHERE public.lead_is_lost(status,stage_type)),
    (SELECT COUNT(*) FROM created WHERE NOT public.lead_is_closed(status,stage_type))
  INTO v_total, v_won, v_lost, v_open, v_count_total, v_count_won, v_count_lost, v_count_open;

  -- Caixa (financial_entries) — eixo paid_at para receitas pagas, due_date/created_at para pendentes
  SELECT
    COALESCE(SUM(net_amount) FILTER (WHERE kind='receivable' AND status IN ('pending','partial','overdue','draft')),0),
    COALESCE(SUM(paid_amount) FILTER (WHERE kind='receivable' AND status IN ('paid','partial')),0),
    COALESCE(SUM(net_amount) FILTER (WHERE kind='payable' AND status IN ('pending','partial','overdue','draft')),0),
    COALESCE(SUM(paid_amount) FILTER (WHERE kind='payable' AND status IN ('paid','partial')),0)
  INTO v_receivable_pending, v_receivable_paid, v_payable_pending, v_payable_paid
  FROM public.financial_entries
  WHERE company_id = _company_id
    AND (_date_from IS NULL OR COALESCE(paid_at::date, due_date, created_at::date) >= _date_from)
    AND (_date_to   IS NULL OR COALESCE(paid_at::date, due_date, created_at::date) <= _date_to);

  RETURN jsonb_build_object(
    'leads', jsonb_build_object(
      'total_value', v_total,
      'won_value', v_won,
      'lost_value', v_lost,
      'open_value', v_open,
      'count_total', v_count_total,
      'count_won', v_count_won,
      'count_lost', v_count_lost,
      'count_open', v_count_open
    ),
    'entries', jsonb_build_object(
      'receivable_pending', v_receivable_pending,
      'receivable_paid', v_receivable_paid,
      'payable_pending', v_payable_pending,
      'payable_paid', v_payable_paid,
      'net_balance', v_receivable_paid - v_payable_paid
    )
  );
END;
$$;

-- 4. REESCRITA get_pipeline_performance_report --------------------------
-- Usa helpers canônicos, lead_realized_value e is_demo=false em todos os blocos
CREATE OR REPLACE FUNCTION public.get_pipeline_performance_report(
  _company_id uuid,
  _from timestamptz,
  _to timestamptz,
  _pipeline_id uuid DEFAULT NULL,
  _user_id uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _loss_reason_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_master boolean := public.has_role(_caller, 'master'::app_role);
  _user_company uuid;
  _result jsonb;
  _kpis jsonb;
  _stage_metrics jsonb;
  _daily jsonb;
  _transitions jsonb;
  _by_pipeline jsonb;
  _by_user jsonb;
  _by_loss_reason jsonb;
  _loss_reason_daily jsonb;
  _scope_company uuid;
  _user_filter uuid := NULLIF(_user_id, '00000000-0000-0000-0000-000000000000'::uuid);
  _unassigned boolean := COALESCE(_user_id = '00000000-0000-0000-0000-000000000000'::uuid, false);
  _status_norm text := lower(NULLIF(trim(coalesce(_status,'')), ''));
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;

  SELECT company_id INTO _user_company FROM public.profiles WHERE id = _caller;

  IF _is_master THEN
    _scope_company := COALESCE(_company_id, _user_company);
  ELSE
    IF _user_company IS NULL THEN
      RAISE EXCEPTION 'no company';
    END IF;
    _scope_company := _user_company;
  END IF;

  IF _scope_company IS NULL THEN
    RAISE EXCEPTION 'no company scope resolved';
  END IF;

  WITH leads_scope AS (
    SELECT l.*, s.stage_type::text AS stage_type_norm
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (
        (_unassigned IS TRUE AND l.assigned_to IS NULL)
        OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter))
      )
      AND (_loss_reason_id IS NULL OR l.loss_reason_id = _loss_reason_id)
      AND (
        _status_norm IS NULL OR _status_norm IN ('all','')
        OR (_status_norm = 'open' AND NOT public.lead_is_closed(l.status, s.stage_type::text))
        OR (_status_norm = 'won' AND public.lead_is_won(l.status, s.stage_type::text))
        OR (_status_norm = 'lost' AND public.lead_is_lost(l.status, s.stage_type::text))
        OR _status_norm = 'reopened'
      )
  ),
  closed AS (
    SELECT l.* FROM leads_scope l
    WHERE l.closed_at IS NOT NULL
      AND l.closed_at >= _from AND l.closed_at <= _to
  ),
  in_period AS (
    SELECT l.* FROM leads_scope l
    WHERE l.created_at >= _from AND l.created_at <= _to
  ),
  reopens AS (
    SELECT lh.*
    FROM public.lead_history lh
    JOIN leads_scope l ON l.id = lh.lead_id
    WHERE lh.created_at >= _from AND lh.created_at <= _to
      AND lh.event_type = 'status_changed'
      AND (lh.payload->>'from') IN ('won','lost')
      AND COALESCE(lh.payload->>'to','') NOT IN ('won','lost')
  )
  SELECT jsonb_build_object(
    'total_leads', (SELECT count(*) FROM in_period),
    'won', (SELECT count(*) FROM closed WHERE public.lead_is_won(status, stage_type_norm)),
    'lost', (SELECT count(*) FROM closed WHERE public.lead_is_lost(status, stage_type_norm)),
    'closed', (SELECT count(*) FROM closed),
    'reopened', (SELECT count(*) FROM reopens),
    'avg_cycle_days', (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (closed_at - created_at))/86400.0)::numeric, 2)
      FROM closed
    ),
    'avg_response_hours', (
      SELECT ROUND(AVG(EXTRACT(EPOCH FROM (responded_at - created_at))/3600.0)::numeric, 2)
      FROM leads_scope
      WHERE responded_at IS NOT NULL
        AND created_at >= _from AND created_at <= _to
    ),
    'revenue_won', COALESCE((SELECT SUM(public.lead_realized_value(value,net_value)) FROM closed WHERE public.lead_is_won(status, stage_type_norm)), 0),
    'revenue_lost', COALESCE((SELECT SUM(public.lead_realized_value(value,net_value)) FROM closed WHERE public.lead_is_lost(status, stage_type_norm)), 0),
    'avg_ticket_won', (
      SELECT ROUND(AVG(public.lead_realized_value(value,net_value))::numeric, 2) FROM closed WHERE public.lead_is_won(status, stage_type_norm)
    ),
    'pipeline_value', COALESCE((SELECT SUM(public.lead_realized_value(value,net_value)) FROM in_period), 0),
    'avg_ticket_all', (
      SELECT ROUND(AVG(public.lead_realized_value(value,net_value))::numeric, 2) FROM in_period
    )
  ) INTO _kpis;

  -- stage_metrics (sem mudança de fórmula, só herda is_demo)
  WITH leads_scope AS (
    SELECT l.id, l.stage_id, l.pipeline_id
    FROM public.leads l
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (
        (_unassigned IS TRUE AND l.assigned_to IS NULL)
        OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter))
      )
  ),
  stages AS (
    SELECT s.id, s.name, s.color, s.position, s.stage_type, s.pipeline_id
    FROM public.pipeline_stages s
    JOIN public.pipelines p ON p.id = s.pipeline_id
    WHERE p.company_id = _scope_company
      AND (_pipeline_id IS NULL OR s.pipeline_id = _pipeline_id)
  ),
  stage_changes AS (
    SELECT lh.lead_id,
      (lh.payload->>'from_stage_id')::uuid AS from_stage_id,
      (lh.payload->>'to_stage_id')::uuid AS to_stage_id,
      lh.created_at
    FROM public.lead_history lh
    JOIN leads_scope l ON l.id = lh.lead_id
    WHERE lh.event_type = 'stage_changed'
  ),
  stage_durations AS (
    SELECT sc.to_stage_id AS stage_id, sc.created_at AS entered_at,
      LEAD(sc.created_at) OVER (PARTITION BY sc.lead_id ORDER BY sc.created_at) AS exited_at
    FROM stage_changes sc
  ),
  duration_filtered AS (
    SELECT stage_id, EXTRACT(EPOCH FROM (COALESCE(exited_at, now()) - entered_at))/3600.0 AS hours
    FROM stage_durations
    WHERE entered_at <= _to AND COALESCE(exited_at, now()) >= _from
  ),
  entries AS (
    SELECT to_stage_id AS stage_id, count(*) AS entries
    FROM stage_changes WHERE created_at >= _from AND created_at <= _to
    GROUP BY to_stage_id
  ),
  exits AS (
    SELECT from_stage_id AS stage_id, count(*) AS exits
    FROM stage_changes WHERE created_at >= _from AND created_at <= _to AND from_stage_id IS NOT NULL
    GROUP BY from_stage_id
  ),
  current_counts AS (
    SELECT stage_id, count(*) AS current_count FROM leads_scope WHERE stage_id IS NOT NULL GROUP BY stage_id
  ),
  avg_dur AS (
    SELECT stage_id, ROUND(AVG(hours)::numeric, 2) AS avg_hours FROM duration_filtered GROUP BY stage_id
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.position), '[]'::jsonb) INTO _stage_metrics
  FROM (
    SELECT s.id AS stage_id, s.name, s.color, s.position, s.stage_type::text AS stage_type, s.pipeline_id,
      COALESCE(e.entries, 0) AS entries,
      COALESCE(x2.exits, 0) AS exits,
      COALESCE(c.current_count, 0) AS current_count,
      COALESCE(a.avg_hours, 0) AS avg_hours_in_stage
    FROM stages s
    LEFT JOIN entries e ON e.stage_id = s.id
    LEFT JOIN exits x2 ON x2.stage_id = s.id
    LEFT JOIN current_counts c ON c.stage_id = s.id
    LEFT JOIN avg_dur a ON a.stage_id = s.id
  ) x;

  -- daily (won/lost no eixo closed_at, classificação canônica)
  WITH days AS (
    SELECT generate_series(date_trunc('day', _from), date_trunc('day', _to), interval '1 day')::date AS day
  ),
  leads_scope AS (
    SELECT l.id FROM public.leads l
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
  ),
  won_lost AS (
    SELECT date_trunc('day', l.closed_at)::date AS day,
      sum(CASE WHEN public.lead_is_won(l.status, s.stage_type::text) THEN 1 ELSE 0 END) AS won,
      sum(CASE WHEN public.lead_is_lost(l.status, s.stage_type::text) THEN 1 ELSE 0 END) AS lost
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
      AND l.closed_at IS NOT NULL
      AND l.closed_at >= _from AND l.closed_at <= _to
    GROUP BY 1
  ),
  reopens AS (
    SELECT date_trunc('day', lh.created_at)::date AS day, count(*) AS reopened
    FROM public.lead_history lh
    JOIN leads_scope ls ON ls.id = lh.lead_id
    WHERE lh.event_type = 'status_changed'
      AND (lh.payload->>'from') IN ('won','lost')
      AND COALESCE(lh.payload->>'to','') NOT IN ('won','lost')
      AND lh.created_at >= _from AND lh.created_at <= _to
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.day), '[]'::jsonb) INTO _daily
  FROM (
    SELECT d.day,
      COALESCE(w.won, 0) AS won,
      COALESCE(w.lost, 0) AS lost,
      COALESCE(r.reopened, 0) AS reopened
    FROM days d
    LEFT JOIN won_lost w ON w.day = d.day
    LEFT JOIN reopens r ON r.day = d.day
  ) x;

  -- transitions (sem mudança de fórmula)
  WITH leads_scope AS (
    SELECT l.id FROM public.leads l
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
  ),
  tr AS (
    SELECT
      (lh.payload->>'from_stage_id')::uuid AS from_id,
      (lh.payload->>'to_stage_id')::uuid AS to_id,
      count(*) AS cnt
    FROM public.lead_history lh
    JOIN leads_scope ls ON ls.id = lh.lead_id
    WHERE lh.event_type = 'stage_changed'
      AND lh.created_at >= _from AND lh.created_at <= _to
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.cnt DESC), '[]'::jsonb) INTO _transitions
  FROM (
    SELECT tr.from_id, sf.name AS from_name, sf.color AS from_color,
      tr.to_id, st.name AS to_name, st.color AS to_color, tr.cnt
    FROM tr
    LEFT JOIN public.pipeline_stages sf ON sf.id = tr.from_id
    LEFT JOIN public.pipeline_stages st ON st.id = tr.to_id
    WHERE tr.to_id IS NOT NULL
    LIMIT 15
  ) x;

  -- by_pipeline (canônico + realized_value)
  WITH leads_scope AS (
    SELECT l.*, s.stage_type::text AS stage_type_norm
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.leads DESC), '[]'::jsonb) INTO _by_pipeline
  FROM (
    SELECT
      p.id AS pipeline_id,
      p.name,
      COUNT(l.id) AS leads,
      COUNT(l.id) FILTER (WHERE public.lead_is_won(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to) AS won,
      COUNT(l.id) FILTER (WHERE public.lead_is_lost(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to) AS lost,
      COALESCE(SUM(public.lead_realized_value(l.value,l.net_value)) FILTER (WHERE public.lead_is_won(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to), 0) AS revenue,
      ROUND(AVG(EXTRACT(EPOCH FROM (l.closed_at - l.created_at))/86400.0) FILTER (WHERE l.closed_at BETWEEN _from AND _to)::numeric, 2) AS avg_cycle_days
    FROM public.pipelines p
    LEFT JOIN leads_scope l ON l.pipeline_id = p.id
    WHERE p.company_id = _scope_company
    GROUP BY p.id, p.name
  ) x;

  -- by_user (canônico + realized_value)
  WITH leads_scope AS (
    SELECT l.*, s.stage_type::text AS stage_type_norm
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.revenue DESC NULLS LAST, x.won DESC), '[]'::jsonb) INTO _by_user
  FROM (
    SELECT
      pr.id AS user_id,
      COALESCE(pr.full_name, pr.email, 'Sem responsável') AS name,
      pr.avatar_url,
      COUNT(l.id) AS leads,
      COUNT(l.id) FILTER (WHERE public.lead_is_won(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to) AS won,
      COUNT(l.id) FILTER (WHERE public.lead_is_lost(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to) AS lost,
      COALESCE(SUM(public.lead_realized_value(l.value,l.net_value)) FILTER (WHERE public.lead_is_won(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to), 0) AS revenue,
      ROUND(AVG(EXTRACT(EPOCH FROM (l.responded_at - l.created_at))/3600.0) FILTER (WHERE l.responded_at IS NOT NULL AND l.created_at BETWEEN _from AND _to)::numeric, 2) AS avg_response_hours,
      ROUND(AVG(public.lead_realized_value(l.value,l.net_value)) FILTER (WHERE public.lead_is_won(l.status, l.stage_type_norm) AND l.closed_at BETWEEN _from AND _to)::numeric, 2) AS avg_ticket
    FROM public.profiles pr
    LEFT JOIN leads_scope l ON l.assigned_to = pr.id
    WHERE pr.company_id = _scope_company
    GROUP BY pr.id, pr.full_name, pr.email, pr.avatar_url
    HAVING COUNT(l.id) > 0
  ) x;

  -- by_loss_reason (canônico, fallback para loss_reason_text mantido)
  WITH leads_scope AS (
    SELECT l.*, s.stage_type::text AS stage_type_norm
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
      AND public.lead_is_lost(l.status, s.stage_type::text)
      AND l.closed_at BETWEEN _from AND _to
  ),
  agg AS (
    SELECT
      l.loss_reason_id,
      COALESCE(lr.label, l.loss_reason_text, 'Sem motivo') AS label,
      COUNT(*) AS cnt,
      COALESCE(SUM(public.lead_realized_value(l.value,l.net_value)), 0) AS value_sum,
      ROUND(AVG(public.lead_realized_value(l.value,l.net_value))::numeric, 2) AS avg_value
    FROM leads_scope l
    LEFT JOIN public.loss_reasons lr ON lr.id = l.loss_reason_id
    GROUP BY 1, 2
  ),
  total AS (SELECT GREATEST(SUM(cnt), 1) AS t FROM agg)
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.cnt DESC), '[]'::jsonb) INTO _by_loss_reason
  FROM (
    SELECT a.loss_reason_id, a.label, a.cnt, a.value_sum, a.avg_value,
      ROUND((a.cnt::numeric / (SELECT t FROM total)) * 100, 1) AS pct
    FROM agg a
  ) x;

  -- loss_reason_daily (canônico)
  WITH leads_scope AS (
    SELECT l.*, s.stage_type::text AS stage_type_norm
    FROM public.leads l
    LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
    WHERE l.company_id = _scope_company
      AND COALESCE(l.is_demo,false) = false
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND ((_unassigned IS TRUE AND l.assigned_to IS NULL) OR (_unassigned IS FALSE AND (_user_filter IS NULL OR l.assigned_to = _user_filter)))
      AND public.lead_is_lost(l.status, s.stage_type::text)
      AND l.closed_at BETWEEN _from AND _to
  ),
  top5 AS (
    SELECT l.loss_reason_id,
      COALESCE(lr.label, l.loss_reason_text, 'Sem motivo') AS label
    FROM leads_scope l
    LEFT JOIN public.loss_reasons lr ON lr.id = l.loss_reason_id
    GROUP BY 1, 2
    ORDER BY count(*) DESC
    LIMIT 5
  )
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.day), '[]'::jsonb) INTO _loss_reason_daily
  FROM (
    SELECT date_trunc('day', l.closed_at)::date AS day,
      t.label,
      COUNT(*) AS cnt
    FROM leads_scope l
    JOIN top5 t ON COALESCE(l.loss_reason_id::text, '_') = COALESCE(t.loss_reason_id::text, '_')
    GROUP BY 1, 2
  ) x;

  _result := jsonb_build_object(
    'kpis', _kpis,
    'stages', _stage_metrics,
    'daily', _daily,
    'transitions', _transitions,
    'by_pipeline', _by_pipeline,
    'by_user', _by_user,
    'by_loss_reason', _by_loss_reason,
    'loss_reason_daily', _loss_reason_daily
  );

  RETURN _result;
END;
$$;
