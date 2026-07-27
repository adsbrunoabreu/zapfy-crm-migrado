
-- 1) Colunas em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS finance_notes text;

-- 2) Desconto por item em lead_procedures
ALTER TABLE public.lead_procedures
  ADD COLUMN IF NOT EXISTS discount_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS discount_amount numeric(15,2);

ALTER TABLE public.lead_procedures
  DROP COLUMN IF EXISTS net_price;
ALTER TABLE public.lead_procedures
  ADD COLUMN net_price numeric(15,2) GENERATED ALWAYS AS (
    GREATEST(
      COALESCE(price_snapshot,0)
      - COALESCE(discount_amount, COALESCE(price_snapshot,0) * COALESCE(discount_pct,0) / 100, 0),
      0
    )
  ) STORED;

-- 3) Tabela de anexos de pagamento
CREATE TABLE IF NOT EXISTS public.lead_payment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'receipt' CHECK (kind IN ('receipt','invoice','other')),
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lpa_lead ON public.lead_payment_attachments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lpa_company ON public.lead_payment_attachments(company_id);

ALTER TABLE public.lead_payment_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lpa_select" ON public.lead_payment_attachments;
CREATE POLICY "lpa_select" ON public.lead_payment_attachments
FOR SELECT TO authenticated
USING (public.has_financial_access(company_id));

DROP POLICY IF EXISTS "lpa_insert" ON public.lead_payment_attachments;
CREATE POLICY "lpa_insert" ON public.lead_payment_attachments
FOR INSERT TO authenticated
WITH CHECK (public.has_financial_access(company_id));

DROP POLICY IF EXISTS "lpa_delete" ON public.lead_payment_attachments;
CREATE POLICY "lpa_delete" ON public.lead_payment_attachments
FOR DELETE TO authenticated
USING (public.has_financial_access(company_id));

-- 4) Storage policies bucket financial-docs (paths: {company_id}/leads/{lead_id}/...)
DROP POLICY IF EXISTS "financial-docs select" ON storage.objects;
CREATE POLICY "financial-docs select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'financial-docs'
  AND public.has_financial_access(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "financial-docs insert" ON storage.objects;
CREATE POLICY "financial-docs insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'financial-docs'
  AND public.has_financial_access(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "financial-docs delete" ON storage.objects;
CREATE POLICY "financial-docs delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'financial-docs'
  AND public.has_financial_access(((storage.foldername(name))[1])::uuid)
);

-- 5) RPC: confirm_lead_payment
CREATE OR REPLACE FUNCTION public.confirm_lead_payment(
  _lead_id uuid,
  _method text,
  _installments int DEFAULT 1,
  _reference text DEFAULT NULL,
  _invoice_number text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_lead_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();
  SELECT company_id INTO v_lead_company FROM public.leads WHERE id = _lead_id;
  IF v_lead_company IS NULL OR v_lead_company <> v_company THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.has_financial_access(v_company) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _method IS NULL OR length(trim(_method)) = 0 THEN
    RAISE EXCEPTION 'metodo_obrigatorio';
  END IF;

  UPDATE public.leads
  SET payment_method = _method,
      payment_installments = COALESCE(_installments,1),
      payment_reference = _reference,
      invoice_number = COALESCE(_invoice_number, invoice_number),
      finance_notes = COALESCE(_notes, finance_notes),
      payment_confirmed_at = now(),
      payment_confirmed_by = auth.uid()
  WHERE id = _lead_id;

  RETURN jsonb_build_object('ok', true, 'confirmed_at', now());
END;
$$;

-- 6) RPC: update_lead_finance (patch parcial)
CREATE OR REPLACE FUNCTION public.update_lead_finance(
  _lead_id uuid,
  _patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_lead_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();
  SELECT company_id INTO v_lead_company FROM public.leads WHERE id = _lead_id;
  IF v_lead_company IS NULL OR v_lead_company <> v_company THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.has_financial_access(v_company) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.leads SET
    value                = COALESCE((_patch->>'value')::numeric, value),
    finance_notes        = COALESCE(_patch->>'finance_notes', finance_notes),
    invoice_number       = COALESCE(_patch->>'invoice_number', invoice_number),
    payment_method       = COALESCE(_patch->>'payment_method', payment_method),
    payment_installments = COALESCE((_patch->>'payment_installments')::int, payment_installments),
    payment_reference    = COALESCE(_patch->>'payment_reference', payment_reference)
  WHERE id = _lead_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7) RPC: update_lead_procedure_discount
CREATE OR REPLACE FUNCTION public.update_lead_procedure_discount(
  _proc_id uuid,
  _pct numeric DEFAULT NULL,
  _amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_proc_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.profiles WHERE id = auth.uid();
  SELECT company_id INTO v_proc_company FROM public.lead_procedures WHERE id = _proc_id;
  IF v_proc_company IS NULL OR v_proc_company <> v_company THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.has_financial_access(v_company) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.lead_procedures
  SET discount_pct = _pct,
      discount_amount = _amount
  WHERE id = _proc_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 8) list_lead_budgets atualizado: sort + novos campos, sem _status
CREATE OR REPLACE FUNCTION public.list_lead_budgets(
  _period_start date,
  _period_end date,
  _pipeline_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _order_by text DEFAULT 'created_at',
  _order_dir text DEFAULT 'desc',
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
            ELSE 'created_at'
          END;
  v_od := CASE WHEN lower(coalesce(_order_dir,'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;

  WITH base AS (
    SELECT l.id, l.numeric_id, l.name, l.value, l.discount_pct, l.discount_amount,
           l.net_value, l.payment_method, l.payment_installments,
           l.payment_reference, l.payment_confirmed_at, l.invoice_number, l.finance_notes,
           l.assigned_to, l.pipeline_id, l.stage_id, l.created_at,
           p.name AS pipeline_name,
           ps.name AS stage_name, ps.color AS stage_color,
           pr.full_name AS assigned_to_name,
           (SELECT count(*) FROM public.lead_payment_attachments a WHERE a.lead_id = l.id) AS attachments_count
    FROM public.leads l
    LEFT JOIN public.pipelines p ON p.id = l.pipeline_id
    LEFT JOIN public.pipeline_stages ps ON ps.id = l.stage_id
    LEFT JOIN public.profiles pr ON pr.id = l.assigned_to
    WHERE l.company_id = v_company
      AND l.created_at::date BETWEEN _period_start AND _period_end
      AND (_pipeline_id IS NULL OR l.pipeline_id = _pipeline_id)
      AND (_assigned_to IS NULL OR l.assigned_to = _assigned_to)
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
      WITH base AS (
        SELECT l.id, l.numeric_id, l.name, l.value, l.discount_pct, l.discount_amount,
               l.net_value, l.payment_method, l.payment_installments,
               l.payment_reference, l.payment_confirmed_at, l.invoice_number, l.finance_notes,
               l.assigned_to, l.pipeline_id, l.stage_id, l.created_at,
               p.name AS pipeline_name,
               ps.name AS stage_name, ps.color AS stage_color,
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
          AND (
            %L::text IS NULL OR %L = ''
            OR l.name ILIKE '%%'||%L||'%%'
            OR l.numeric_id::text = %L
          )
      )
      SELECT * FROM base ORDER BY %I %s NULLS LAST, created_at DESC LIMIT %s OFFSET %s
    ) b
  $q$,
    v_company, _period_start, _period_end,
    _pipeline_id, _pipeline_id,
    _assigned_to, _assigned_to,
    _search, _search, _search, _search,
    v_ob, v_od, _limit, _offset
  ) INTO v_items;

  RETURN jsonb_build_object('total', v_total, 'items', v_items);
END;
$$;

-- 9) Bucket existe e permanece privado (já criado)
