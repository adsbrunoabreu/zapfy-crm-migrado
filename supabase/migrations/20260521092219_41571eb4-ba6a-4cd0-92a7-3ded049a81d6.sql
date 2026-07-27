
-- ============ 1) TABELAS ============

CREATE TABLE public.financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('income','expense')),
  is_direct_cost boolean NOT NULL DEFAULT false,
  is_operational boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  color text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);
CREATE INDEX ix_fin_cat_company ON public.financial_categories(company_id) WHERE archived = false;

CREATE TABLE public.financial_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE public.financial_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('receivable','payable')),
  category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  cost_center_id uuid REFERENCES public.financial_cost_centers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  party_name text,
  description text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  discount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  net_amount numeric(14,2) GENERATED ALWAYS AS (amount - discount) STORED,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_date date,
  paid_at timestamptz,
  payment_method text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','partial','paid','overdue','canceled')),
  installment_number int,
  installment_total int,
  parent_entry_id uuid REFERENCES public.financial_entries(id) ON DELETE CASCADE,
  external_payment_id text,
  external_provider text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  approved_by uuid,
  paid_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_fin_entries_company_status ON public.financial_entries(company_id, status);
CREATE INDEX ix_fin_entries_due ON public.financial_entries(company_id, kind, due_date);
CREATE INDEX ix_fin_entries_paid_at ON public.financial_entries(company_id, paid_at);
CREATE INDEX ix_fin_entries_lead ON public.financial_entries(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX ix_fin_entries_category ON public.financial_entries(category_id);

CREATE TABLE public.financial_entry_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.financial_entries(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_fin_att_entry ON public.financial_entry_attachments(entry_id);

-- ============ 2) updated_at triggers ============

CREATE TRIGGER trg_fin_categories_updated BEFORE UPDATE ON public.financial_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fin_cost_centers_updated BEFORE UPDATE ON public.financial_cost_centers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fin_entries_updated BEFORE UPDATE ON public.financial_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3) RLS ============

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_entry_attachments ENABLE ROW LEVEL SECURITY;

-- helper: usuário tem acesso financeiro nesta empresa
CREATE OR REPLACE FUNCTION public.has_financial_access(_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'master'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = _company_id
        AND p.role IN ('admin','financeiro','gestor')
    );
$$;

-- categorias
CREATE POLICY "fin_cat_select" ON public.financial_categories
  FOR SELECT USING (
    public.has_financial_access(company_id)
    AND (public.has_role(auth.uid(),'master'::public.app_role) OR public.is_company_active(company_id))
  );
CREATE POLICY "fin_cat_insert" ON public.financial_categories
  FOR INSERT WITH CHECK (
    public.has_financial_access(company_id)
    AND (public.has_role(auth.uid(),'master'::public.app_role) OR public.is_company_active(company_id))
  );
CREATE POLICY "fin_cat_update" ON public.financial_categories
  FOR UPDATE USING (public.has_financial_access(company_id))
  WITH CHECK (public.has_financial_access(company_id));
CREATE POLICY "fin_cat_delete" ON public.financial_categories
  FOR DELETE USING (public.has_financial_access(company_id) AND is_system = false);

-- cost centers
CREATE POLICY "fin_cc_select" ON public.financial_cost_centers
  FOR SELECT USING (
    public.has_financial_access(company_id)
    AND (public.has_role(auth.uid(),'master'::public.app_role) OR public.is_company_active(company_id))
  );
CREATE POLICY "fin_cc_modify" ON public.financial_cost_centers
  FOR ALL USING (public.has_financial_access(company_id))
  WITH CHECK (public.has_financial_access(company_id));

-- entries
CREATE POLICY "fin_entries_select" ON public.financial_entries
  FOR SELECT USING (
    public.has_financial_access(company_id)
    AND (public.has_role(auth.uid(),'master'::public.app_role) OR public.is_company_active(company_id))
  );
CREATE POLICY "fin_entries_insert" ON public.financial_entries
  FOR INSERT WITH CHECK (
    public.has_financial_access(company_id)
    AND (public.has_role(auth.uid(),'master'::public.app_role) OR public.is_company_active(company_id))
  );
CREATE POLICY "fin_entries_update" ON public.financial_entries
  FOR UPDATE USING (public.has_financial_access(company_id))
  WITH CHECK (public.has_financial_access(company_id));
CREATE POLICY "fin_entries_delete" ON public.financial_entries
  FOR DELETE USING (public.has_financial_access(company_id));

-- attachments
CREATE POLICY "fin_att_select" ON public.financial_entry_attachments
  FOR SELECT USING (public.has_financial_access(company_id));
CREATE POLICY "fin_att_modify" ON public.financial_entry_attachments
  FOR ALL USING (public.has_financial_access(company_id))
  WITH CHECK (public.has_financial_access(company_id));

-- ============ 4) Storage bucket ============

INSERT INTO storage.buckets (id, name, public) VALUES ('financial-docs','financial-docs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "fin_docs_select" ON storage.objects FOR SELECT
  USING (
    bucket_id = 'financial-docs'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          public.has_role(auth.uid(),'master'::public.app_role)
          OR (p.company_id::text = (storage.foldername(name))[1] AND p.role IN ('admin','financeiro','gestor'))
        )
    )
  );
CREATE POLICY "fin_docs_insert" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'financial-docs'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id::text = (storage.foldername(name))[1]
        AND p.role IN ('admin','financeiro','gestor')
    )
  );
CREATE POLICY "fin_docs_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'financial-docs'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id::text = (storage.foldername(name))[1]
        AND p.role IN ('admin','financeiro','gestor')
    )
  );

-- ============ 5) Categorias-semente por empresa ============

CREATE OR REPLACE FUNCTION public.ensure_financial_seed(_company_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_categories (company_id, name, kind, is_direct_cost, is_operational, is_system, color)
  VALUES
    (_company_id, 'Vendas',           'income',  false, false, true,  '#22c55e'),
    (_company_id, 'Serviços',         'income',  false, false, true,  '#10b981'),
    (_company_id, 'Outras Receitas',  'income',  false, false, true,  '#84cc16'),
    (_company_id, 'Repasse Médico',   'expense', true,  false, true,  '#f97316'),
    (_company_id, 'Salários',         'expense', false, true,  true,  '#ef4444'),
    (_company_id, 'Aluguel',          'expense', false, true,  true,  '#a855f7'),
    (_company_id, 'Marketing',        'expense', false, true,  true,  '#3b82f6'),
    (_company_id, 'Impostos',         'expense', false, true,  true,  '#64748b'),
    (_company_id, 'Outras Despesas',  'expense', false, true,  true,  '#71717a')
  ON CONFLICT (company_id, name) DO NOTHING;
END;
$$;

-- aplica para empresas existentes
DO $$
DECLARE c_id uuid;
BEGIN
  FOR c_id IN SELECT id FROM public.companies LOOP
    PERFORM public.ensure_financial_seed(c_id);
  END LOOP;
END $$;

-- trigger para novas empresas
CREATE OR REPLACE FUNCTION public.tg_new_company_financial_seed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ensure_financial_seed(NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_new_company_financial_seed ON public.companies;
CREATE TRIGGER trg_new_company_financial_seed
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.tg_new_company_financial_seed();

-- ============ 6) Auto-criar receivable quando lead vira 'won' ============

CREATE OR REPLACE FUNCTION public.tg_lead_won_create_receivable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_stage_type text;
  v_old_stage_type text;
  v_cat_id uuid;
  v_exists boolean;
BEGIN
  SELECT stage_type INTO v_new_stage_type FROM public.pipeline_stages WHERE id = NEW.stage_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT stage_type INTO v_old_stage_type FROM public.pipeline_stages WHERE id = OLD.stage_id;
  END IF;

  IF v_new_stage_type IS DISTINCT FROM 'won' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND v_old_stage_type = 'won' THEN
    RETURN NEW; -- já estava ganho
  END IF;
  IF COALESCE(NEW.value, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- evita duplicar caso já exista entry vinculada
  SELECT EXISTS(
    SELECT 1 FROM public.financial_entries
    WHERE lead_id = NEW.id AND kind = 'receivable' AND status <> 'canceled'
  ) INTO v_exists;
  IF v_exists THEN RETURN NEW; END IF;

  SELECT id INTO v_cat_id
  FROM public.financial_categories
  WHERE company_id = NEW.company_id AND name = 'Vendas'
  LIMIT 1;

  INSERT INTO public.financial_entries (
    company_id, kind, category_id, lead_id, contact_id, party_name,
    description, amount, due_date, status, metadata, created_by
  ) VALUES (
    NEW.company_id, 'receivable', v_cat_id, NEW.id, NEW.contact_id, NEW.name,
    'Venda — ' || NEW.name, NEW.value,
    (now()::date + INTERVAL '7 days')::date,
    'draft',
    jsonb_build_object('auto', true, 'lead_numeric_id', NEW.numeric_id),
    NEW.closed_by
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_won_create_receivable ON public.leads;
CREATE TRIGGER trg_lead_won_create_receivable
  AFTER INSERT OR UPDATE OF stage_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_lead_won_create_receivable();

-- ============ 7) RPC: get_financial_overview ============

CREATE OR REPLACE FUNCTION public.get_financial_overview(
  _company_id uuid,
  _date_from date DEFAULT NULL,
  _date_to date DEFAULT NULL,
  _pipeline_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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

  SELECT
    COALESCE(SUM(l.value),0),
    COALESCE(SUM(l.value) FILTER (WHERE s.stage_type = 'won'),0),
    COALESCE(SUM(l.value) FILTER (WHERE s.stage_type = 'lost'),0),
    COALESCE(SUM(l.value) FILTER (WHERE COALESCE(s.stage_type,'open') NOT IN ('won','lost')),0),
    COUNT(*),
    COUNT(*) FILTER (WHERE s.stage_type = 'won'),
    COUNT(*) FILTER (WHERE s.stage_type = 'lost'),
    COUNT(*) FILTER (WHERE COALESCE(s.stage_type,'open') NOT IN ('won','lost'))
  INTO v_total, v_won, v_lost, v_open, v_count_total, v_count_won, v_count_lost, v_count_open
  FROM public.leads l
  LEFT JOIN public.pipeline_stages s ON s.id = l.stage_id
  WHERE l.company_id = _company_id
    AND l.is_demo = false
    AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
    AND (_date_from IS NULL OR l.created_at::date >= _date_from)
    AND (_date_to IS NULL OR l.created_at::date <= _date_to);

  SELECT
    COALESCE(SUM(net_amount) FILTER (WHERE kind='receivable' AND status IN ('pending','partial','overdue','draft')),0),
    COALESCE(SUM(paid_amount) FILTER (WHERE kind='receivable' AND status IN ('paid','partial')),0),
    COALESCE(SUM(net_amount) FILTER (WHERE kind='payable' AND status IN ('pending','partial','overdue','draft')),0),
    COALESCE(SUM(paid_amount) FILTER (WHERE kind='payable' AND status IN ('paid','partial')),0)
  INTO v_receivable_pending, v_receivable_paid, v_payable_pending, v_payable_paid
  FROM public.financial_entries
  WHERE company_id = _company_id
    AND (_date_from IS NULL OR COALESCE(paid_at::date, due_date, created_at::date) >= _date_from)
    AND (_date_to IS NULL OR COALESCE(paid_at::date, due_date, created_at::date) <= _date_to);

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

-- ============ 8) Marcar como pago helper ============

CREATE OR REPLACE FUNCTION public.financial_mark_paid(
  _entry_id uuid,
  _paid_amount numeric DEFAULT NULL,
  _paid_at timestamptz DEFAULT now(),
  _payment_method text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_net numeric;
  v_paid numeric;
  v_new_status text;
BEGIN
  SELECT company_id, net_amount INTO v_company_id, v_net
  FROM public.financial_entries WHERE id = _entry_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'entry not found'; END IF;
  IF NOT public.has_financial_access(v_company_id) THEN RAISE EXCEPTION 'access denied'; END IF;

  v_paid := COALESCE(_paid_amount, v_net);
  IF v_paid >= v_net THEN v_new_status := 'paid';
  ELSIF v_paid > 0 THEN v_new_status := 'partial';
  ELSE v_new_status := 'pending'; END IF;

  UPDATE public.financial_entries
  SET paid_amount = v_paid,
      paid_at = _paid_at,
      payment_method = COALESCE(_payment_method, payment_method),
      paid_by = auth.uid(),
      status = v_new_status
  WHERE id = _entry_id;

  RETURN _entry_id;
END;
$$;
