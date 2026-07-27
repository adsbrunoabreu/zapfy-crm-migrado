-- ========== Subscriptions / Invoices / Companies columns ==========
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS asaas_customer_id text,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id text,
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS card_last4 text,
  ADD COLUMN IF NOT EXISTS card_brand text,
  ADD COLUMN IF NOT EXISTS next_due_date date;

CREATE INDEX IF NOT EXISTS idx_subscriptions_asaas_sub ON public.subscriptions(asaas_subscription_id) WHERE asaas_subscription_id IS NOT NULL;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS asaas_payment_id text,
  ADD COLUMN IF NOT EXISTS asaas_invoice_url text,
  ADD COLUMN IF NOT EXISTS pix_qrcode text,
  ADD COLUMN IF NOT EXISTS pix_payload text,
  ADD COLUMN IF NOT EXISTS pix_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_date date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_asaas_payment_unique
  ON public.invoices(asaas_payment_id) WHERE asaas_payment_id IS NOT NULL;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS asaas_customer_id text;

CREATE INDEX IF NOT EXISTS idx_companies_asaas_customer ON public.companies(asaas_customer_id) WHERE asaas_customer_id IS NOT NULL;

-- ========== payment_attempts (audit) ==========
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  asaas_payment_id text,
  event text NOT NULL,
  status text,
  amount numeric(10,2),
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_company ON public.payment_attempts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_attempts_asaas ON public.payment_attempts(asaas_payment_id);

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master manages payment_attempts"
  ON public.payment_attempts FOR ALL
  USING (public.is_master(auth.uid()))
  WITH CHECK (public.is_master(auth.uid()));

CREATE POLICY "Company admin reads own payment_attempts"
  ON public.payment_attempts FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid()));

-- ========== tracking_events (audit) ==========
CREATE TABLE IF NOT EXISTS public.tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  user_id uuid,
  event_name text NOT NULL,
  event_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('client','server')),
  destination text NOT NULL CHECK (destination IN ('meta_capi','google_ads','dataLayer','pixel')),
  status text NOT NULL DEFAULT 'pending',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracking_events_event ON public.tracking_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_company ON public.tracking_events(company_id, created_at DESC);

ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master manages tracking_events"
  ON public.tracking_events FOR ALL
  USING (public.is_master(auth.uid()))
  WITH CHECK (public.is_master(auth.uid()));

-- ========== RPC: apply_paid_invoice ==========
CREATE OR REPLACE FUNCTION public.apply_paid_invoice(
  _asaas_payment_id text,
  _paid_at timestamptz,
  _method text,
  _amount numeric DEFAULT NULL,
  _invoice_url text DEFAULT NULL
) RETURNS public.invoices
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv public.invoices;
  _sub public.subscriptions;
  _new_end timestamptz;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE asaas_payment_id = _asaas_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice with asaas_payment_id % not found', _asaas_payment_id;
  END IF;

  UPDATE public.invoices
    SET status = 'paid',
        paid_at = COALESCE(_paid_at, now()),
        payment_method = COALESCE(_method, payment_method),
        asaas_invoice_url = COALESCE(_invoice_url, asaas_invoice_url)
    WHERE id = _inv.id;

  SELECT * INTO _sub FROM public.subscriptions WHERE id = _inv.subscription_id;
  IF FOUND THEN
    _new_end := CASE WHEN _sub.billing_cycle = 'yearly'
                THEN GREATEST(_sub.current_period_end, now()) + interval '365 days'
                ELSE GREATEST(_sub.current_period_end, now()) + interval '30 days' END;

    UPDATE public.subscriptions
      SET status = 'active',
          current_period_start = GREATEST(_sub.current_period_end, now()),
          current_period_end = _new_end,
          next_due_date = _new_end::date,
          updated_at = now()
      WHERE id = _sub.id;

    UPDATE public.companies SET plan_status = 'active' WHERE id = _sub.company_id;
  END IF;

  SELECT * INTO _inv FROM public.invoices WHERE id = _inv.id;
  RETURN _inv;
END;
$$;

-- ========== RPC: mark_invoice_overdue ==========
CREATE OR REPLACE FUNCTION public.mark_invoice_overdue(_asaas_payment_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv public.invoices;
BEGIN
  SELECT * INTO _inv FROM public.invoices WHERE asaas_payment_id = _asaas_payment_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.invoices SET status = 'past_due' WHERE id = _inv.id;
  UPDATE public.subscriptions SET status = 'past_due', updated_at = now()
    WHERE id = _inv.subscription_id;
  UPDATE public.companies SET plan_status = 'suspended'
    WHERE id = _inv.company_id AND plan_status NOT IN ('canceled');
END;
$$;

-- ========== RPC: attach_payment_method ==========
CREATE OR REPLACE FUNCTION public.attach_payment_method(
  _subscription_id uuid,
  _method text,
  _last4 text DEFAULT NULL,
  _brand text DEFAULT NULL,
  _asaas_subscription_id text DEFAULT NULL,
  _asaas_customer_id text DEFAULT NULL
) RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _sub public.subscriptions;
BEGIN
  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subscription not found'; END IF;
  IF _sub.company_id <> public.get_user_company_id(auth.uid()) AND NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  UPDATE public.subscriptions
    SET payment_method = _method,
        card_last4 = COALESCE(_last4, card_last4),
        card_brand = COALESCE(_brand, card_brand),
        asaas_subscription_id = COALESCE(_asaas_subscription_id, asaas_subscription_id),
        asaas_customer_id = COALESCE(_asaas_customer_id, asaas_customer_id),
        updated_at = now()
    WHERE id = _subscription_id;

  IF _asaas_customer_id IS NOT NULL THEN
    UPDATE public.companies SET asaas_customer_id = _asaas_customer_id
      WHERE id = _sub.company_id AND asaas_customer_id IS NULL;
  END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE id = _subscription_id;
  RETURN _sub;
END;
$$;

-- ========== Seed system_integrations ==========
INSERT INTO public.system_integrations (key, value)
VALUES
  ('asaas', jsonb_build_object('enabled', false, 'environment', 'sandbox', 'default_due_days', 3)),
  ('tracking', jsonb_build_object(
    'enabled', false,
    'meta_pixel_id', '',
    'meta_capi_test_event_code', '',
    'gtm_id', '',
    'google_ads_id', '',
    'google_ads_conversion_label', ''
  ))
ON CONFLICT (key) DO NOTHING;