
-- ============ Orçamentos: colunas em leads ============
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS payment_installments smallint DEFAULT 1,
  ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS discount_approved_by uuid,
  ADD COLUMN IF NOT EXISTS discount_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS net_value numeric(15,2)
    GENERATED ALWAYS AS (
      GREATEST(
        COALESCE(value,0) - COALESCE(discount_amount, COALESCE(value,0)*COALESCE(discount_pct,0)/100, 0),
        0
      )
    ) STORED;

-- O trigger trg_prevent_closed_lead_edits bloqueia updates em leads won/lost.
-- O update de payment_method/desconto em fichas abertas continua livre.

-- ============ Auditoria de descontos ============
CREATE TABLE IF NOT EXISTS public.lead_discount_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  requested_by uuid,
  approved_by uuid NOT NULL,
  discount_pct numeric(5,2),
  discount_amount numeric(15,2),
  previous_pct numeric(5,2),
  previous_amount numeric(15,2),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lda_lead ON public.lead_discount_approvals(lead_id);
CREATE INDEX IF NOT EXISTS idx_lda_company ON public.lead_discount_approvals(company_id, created_at DESC);

ALTER TABLE public.lead_discount_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lda_select" ON public.lead_discount_approvals
  FOR SELECT USING (public.has_financial_access(company_id));
CREATE POLICY "lda_insert_system" ON public.lead_discount_approvals
  FOR INSERT WITH CHECK (false); -- só via RPC SECURITY DEFINER

-- ============ RPC: release_lead_discount ============
CREATE OR REPLACE FUNCTION public.release_lead_discount(
  _lead_id uuid,
  _discount_pct numeric DEFAULT NULL,
  _discount_amount numeric DEFAULT NULL,
  _reason text DEFAULT NULL,
  _password text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, extensions
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_lead record;
  v_pwd_ok boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT id, company_id, value, status, discount_pct, discount_amount
    INTO v_lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;

  IF NOT public.has_financial_access(v_lead.company_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_lead.status IN ('won','lost') THEN
    RAISE EXCEPTION 'ficha_fechada';
  END IF;

  -- Validação de senha do usuário (via crypt do schema auth)
  SELECT (u.encrypted_password = extensions.crypt(_password, u.encrypted_password))
    INTO v_pwd_ok
  FROM auth.users u WHERE u.id = v_user;

  IF NOT COALESCE(v_pwd_ok, false) THEN
    RAISE EXCEPTION 'senha_invalida';
  END IF;

  IF _discount_pct IS NOT NULL AND (_discount_pct < 0 OR _discount_pct > 100) THEN
    RAISE EXCEPTION 'desconto_invalido';
  END IF;
  IF _discount_amount IS NOT NULL AND _discount_amount < 0 THEN
    RAISE EXCEPTION 'desconto_invalido';
  END IF;

  UPDATE public.leads
    SET discount_pct = _discount_pct,
        discount_amount = _discount_amount,
        discount_approved_by = v_user,
        discount_approved_at = now(),
        updated_at = now()
  WHERE id = _lead_id;

  INSERT INTO public.lead_discount_approvals(
    company_id, lead_id, requested_by, approved_by,
    discount_pct, discount_amount, previous_pct, previous_amount, reason
  ) VALUES (
    v_lead.company_id, _lead_id, v_user, v_user,
    _discount_pct, _discount_amount, v_lead.discount_pct, v_lead.discount_amount, _reason
  );

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.release_lead_discount(uuid, numeric, numeric, text, text) TO authenticated;

-- ============ RPC: get_budget_overview ============
CREATE OR REPLACE FUNCTION public.get_budget_overview(
  _period_start date,
  _period_end date,
  _pipeline_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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

  -- win rate do período atual
  SELECT CASE WHEN COUNT(*) FILTER (WHERE status IN ('won','lost')) = 0 THEN 0.5
              ELSE COUNT(*) FILTER (WHERE status='won')::numeric / COUNT(*) FILTER (WHERE status IN ('won','lost')) END
    INTO v_win_rate
  FROM public.leads
  WHERE company_id = v_company
    AND created_at::date BETWEEN _period_start AND _period_end
    AND (_pipeline_id IS NULL OR pipeline_id = _pipeline_id)
    AND (_assigned_to IS NULL OR assigned_to = _assigned_to);

  WITH base AS (
    SELECT l.* FROM public.leads l
    WHERE l.company_id = v_company
      AND l.created_at::date BETWEEN _period_start AND _period_end
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
  ),
  agg AS (
    SELECT
      COUNT(*) AS count_total,
      COUNT(*) FILTER (WHERE status='won') AS count_won,
      COUNT(*) FILTER (WHERE status='lost') AS count_lost,
      COUNT(*) FILTER (WHERE status NOT IN ('won','lost')) AS count_open,
      COALESCE(SUM(net_value),0) AS total_value,
      COALESCE(SUM(net_value) FILTER (WHERE status='won'),0) AS won_value,
      COALESCE(SUM(net_value) FILTER (WHERE status='lost'),0) AS lost_value,
      COALESCE(SUM(net_value) FILTER (WHERE status NOT IN ('won','lost')),0) AS open_value,
      COALESCE(AVG(net_value) FILTER (WHERE status='won'),0) AS avg_ticket,
      COALESCE(SUM(COALESCE(discount_amount, COALESCE(value,0)*COALESCE(discount_pct,0)/100, 0)),0) AS discount_total
    FROM base
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

  WITH base AS (
    SELECT l.* FROM public.leads l
    WHERE l.company_id = v_company
      AND l.created_at::date BETWEEN v_prev_start AND v_prev_end
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
  ),
  agg AS (
    SELECT
      COUNT(*) AS count_total,
      COUNT(*) FILTER (WHERE status='won') AS count_won,
      COUNT(*) FILTER (WHERE status='lost') AS count_lost,
      COUNT(*) FILTER (WHERE status NOT IN ('won','lost')) AS count_open,
      COALESCE(SUM(net_value),0) AS total_value,
      COALESCE(SUM(net_value) FILTER (WHERE status='won'),0) AS won_value,
      COALESCE(SUM(net_value) FILTER (WHERE status='lost'),0) AS lost_value,
      COALESCE(SUM(net_value) FILTER (WHERE status NOT IN ('won','lost')),0) AS open_value,
      COALESCE(AVG(net_value) FILTER (WHERE status='won'),0) AS avg_ticket,
      COALESCE(SUM(COALESCE(discount_amount, COALESCE(value,0)*COALESCE(discount_pct,0)/100, 0)),0) AS discount_total
    FROM base
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
    'projection', a.open_value * v_win_rate,
    'gross_revenue', f.gross_revenue,
    'discount_total', a.discount_total
  ) INTO v_previous FROM agg a, fin f;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', _period_start, 'end', _period_end),
    'previous_period', jsonb_build_object('start', v_prev_start, 'end', v_prev_end),
    'current', v_current,
    'previous', v_previous
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_budget_overview(date, date, uuid, uuid) TO authenticated;

-- ============ RPC: list_lead_budgets ============
CREATE OR REPLACE FUNCTION public.list_lead_budgets(
  _period_start date,
  _period_end date,
  _pipeline_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_total int;
  v_items jsonb;
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();
  IF NOT public.has_financial_access(v_company) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH base AS (
    SELECT l.id, l.numeric_id, l.name, l.status, l.value, l.discount_pct, l.discount_amount,
           l.net_value, l.payment_method, l.payment_installments, l.assigned_to,
           l.pipeline_id, l.stage_id, l.created_at,
           p.name AS pipeline_name,
           ps.name AS stage_name, ps.color AS stage_color,
           pr.full_name AS assigned_to_name
    FROM public.leads l
    LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
    LEFT JOIN public.pipeline_stages ps ON ps.id = l.stage_id
    LEFT JOIN public.profiles pr ON pr.id = l.assigned_to
    WHERE l.company_id = v_company
      AND l.created_at::date BETWEEN _period_start AND _period_end
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
      AND (_status IS NULL OR _status = 'all' OR l.status::text = _status)
      AND (
        _search IS NULL OR _search = ''
        OR l.name ILIKE '%'||_search||'%'
        OR l.numeric_id::text = _search
      )
  )
  SELECT COUNT(*) INTO v_total FROM base;

  WITH base AS (
    SELECT l.id, l.numeric_id, l.name, l.status::text AS status, l.value, l.discount_pct, l.discount_amount,
           l.net_value, l.payment_method, l.payment_installments, l.assigned_to,
           l.pipeline_id, l.stage_id, l.created_at,
           p.name AS pipeline_name,
           ps.name AS stage_name, ps.color AS stage_color,
           pr.full_name AS assigned_to_name
    FROM public.leads l
    LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
    LEFT JOIN public.pipeline_stages ps ON ps.id = l.stage_id
    LEFT JOIN public.profiles pr ON pr.id = l.assigned_to
    WHERE l.company_id = v_company
      AND l.created_at::date BETWEEN _period_start AND _period_end
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
      AND (_status IS NULL OR _status = 'all' OR l.status::text = _status)
      AND (
        _search IS NULL OR _search = ''
        OR l.name ILIKE '%'||_search||'%'
        OR l.numeric_id::text = _search
      )
    ORDER BY l.created_at DESC
    LIMIT _limit OFFSET _offset
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_items FROM base b;

  RETURN jsonb_build_object('total', v_total, 'items', v_items);
END $$;

GRANT EXECUTE ON FUNCTION public.list_lead_budgets(date, date, uuid, uuid, text, text, int, int) TO authenticated;
