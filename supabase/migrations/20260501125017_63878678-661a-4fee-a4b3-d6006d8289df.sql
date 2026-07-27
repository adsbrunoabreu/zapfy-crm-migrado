-- ============================================================
-- Subscription management for tenants
-- - Adds Stripe-ready columns + cancel_at_period_end + pending_plan_id
-- - Creates invoices table with RLS
-- - Adds tenant-side functions: change_subscription_plan, cancel_my_subscription,
--   reactivate_my_subscription, change_billing_cycle
-- - Adds renew_due_subscriptions() scheduled function
-- ============================================================

-- 1) Extend subscriptions
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_plan_id uuid REFERENCES public.subscription_plans(id),
  ADD COLUMN IF NOT EXISTS pending_billing_cycle text;

-- 2) Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  billing_cycle text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'paid',
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  payment_method text,
  stripe_invoice_id text,
  pdf_url text,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON public.invoices(company_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_subscription ON public.invoices(subscription_id, issued_at DESC);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company admins view own invoices" ON public.invoices;
CREATE POLICY "Company admins view own invoices"
ON public.invoices FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()))
);

DROP POLICY IF EXISTS "Masters manage invoices" ON public.invoices;
CREATE POLICY "Masters manage invoices"
ON public.invoices FOR ALL TO authenticated
USING (is_master(auth.uid()))
WITH CHECK (is_master(auth.uid()));

-- 3) Sequence + helper for invoice numbers
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _n bigint;
BEGIN
  _n := nextval('public.invoice_number_seq');
  RETURN 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(_n::text, 6, '0');
END;
$$;

-- 4) Tenant-facing function: change plan
--    Upgrade (preço >= atual) -> efeito imediato, gera invoice e estende periodo
--    Downgrade (preço < atual) -> agenda via pending_plan_id (aplica no fim do periodo)
CREATE OR REPLACE FUNCTION public.change_subscription_plan(_new_plan_id uuid, _billing_cycle text DEFAULT NULL)
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _company_id uuid;
  _sub public.subscriptions;
  _plan public.subscription_plans;
  _cycle text;
  _new_price numeric;
  _is_upgrade boolean;
BEGIN
  _company_id := get_user_company_id(auth.uid());
  IF _company_id IS NULL OR NOT is_company_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO _sub FROM public.subscriptions
  WHERE company_id = _company_id
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No subscription';
  END IF;

  SELECT * INTO _plan FROM public.subscription_plans WHERE id = _new_plan_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found';
  END IF;

  _cycle := COALESCE(_billing_cycle, _sub.billing_cycle);
  IF _cycle NOT IN ('monthly','yearly') THEN
    RAISE EXCEPTION 'Invalid billing cycle';
  END IF;

  _new_price := CASE WHEN _cycle = 'yearly' THEN _plan.yearly_price / 12.0 ELSE _plan.monthly_price END;
  _is_upgrade := _new_price >= COALESCE(_sub.monthly_price, 0);

  IF _is_upgrade THEN
    -- aplicar imediatamente
    UPDATE public.subscriptions
    SET plan_id = _plan.id,
        plan_name = _plan.name,
        monthly_price = _new_price,
        billing_cycle = _cycle,
        status = 'active',
        cancel_at_period_end = false,
        pending_plan_id = NULL,
        pending_billing_cycle = NULL,
        updated_at = now()
    WHERE id = _sub.id;

    -- Gera invoice prorrateada simples (valor cheio do novo plano)
    INSERT INTO public.invoices (
      company_id, subscription_id, invoice_number, amount, currency,
      billing_cycle, period_start, period_end, status, paid_at, payment_method, description
    ) VALUES (
      _company_id, _sub.id, public.next_invoice_number(),
      CASE WHEN _cycle = 'yearly' THEN _plan.yearly_price ELSE _plan.monthly_price END,
      'BRL', _cycle, now(),
      CASE WHEN _cycle = 'yearly' THEN now() + interval '365 days' ELSE now() + interval '30 days' END,
      'paid', now(), 'manual',
      'Mudança para plano ' || _plan.name || ' (' || _cycle || ')'
    );

    UPDATE public.subscriptions
    SET current_period_start = now(),
        current_period_end = CASE WHEN _cycle = 'yearly' THEN now() + interval '365 days' ELSE now() + interval '30 days' END
    WHERE id = _sub.id;

    UPDATE public.companies SET plan_status = 'active' WHERE id = _company_id AND plan_status NOT IN ('active');
  ELSE
    -- Downgrade: agenda
    UPDATE public.subscriptions
    SET pending_plan_id = _plan.id,
        pending_billing_cycle = _cycle,
        updated_at = now()
    WHERE id = _sub.id;
  END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE id = _sub.id;
  RETURN _sub;
END;
$$;

-- 5) Cancelar / reativar
CREATE OR REPLACE FUNCTION public.cancel_my_subscription()
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _company_id uuid;
  _sub public.subscriptions;
BEGIN
  _company_id := get_user_company_id(auth.uid());
  IF _company_id IS NULL OR NOT is_company_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO _sub FROM public.subscriptions
  WHERE company_id = _company_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No subscription';
  END IF;

  UPDATE public.subscriptions
  SET cancel_at_period_end = true,
      pending_plan_id = NULL,
      pending_billing_cycle = NULL,
      updated_at = now()
  WHERE id = _sub.id;

  SELECT * INTO _sub FROM public.subscriptions WHERE id = _sub.id;
  RETURN _sub;
END;
$$;

CREATE OR REPLACE FUNCTION public.reactivate_my_subscription()
RETURNS public.subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _company_id uuid;
  _sub public.subscriptions;
BEGIN
  _company_id := get_user_company_id(auth.uid());
  IF _company_id IS NULL OR NOT is_company_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO _sub FROM public.subscriptions
  WHERE company_id = _company_id ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No subscription';
  END IF;

  IF _sub.status = 'canceled' THEN
    -- Recriar período se já foi cancelado de fato
    UPDATE public.subscriptions
    SET status = 'active',
        canceled_at = NULL,
        cancel_at_period_end = false,
        current_period_start = now(),
        current_period_end = CASE WHEN _sub.billing_cycle = 'yearly' THEN now() + interval '365 days' ELSE now() + interval '30 days' END,
        updated_at = now()
    WHERE id = _sub.id;
    UPDATE public.companies SET plan_status = 'active' WHERE id = _company_id;
  ELSE
    UPDATE public.subscriptions
    SET cancel_at_period_end = false,
        canceled_at = NULL,
        updated_at = now()
    WHERE id = _sub.id;
  END IF;

  SELECT * INTO _sub FROM public.subscriptions WHERE id = _sub.id;
  RETURN _sub;
END;
$$;

-- 6) Renovação automática diária
CREATE OR REPLACE FUNCTION public.renew_due_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _row RECORD;
  _count integer := 0;
  _new_start timestamptz;
  _new_end timestamptz;
  _plan public.subscription_plans;
  _amount numeric;
  _cycle text;
BEGIN
  FOR _row IN
    SELECT * FROM public.subscriptions
    WHERE status IN ('active','trialing','past_due')
      AND current_period_end IS NOT NULL
      AND current_period_end < now()
  LOOP
    IF _row.cancel_at_period_end THEN
      UPDATE public.subscriptions
      SET status = 'canceled', canceled_at = now(), updated_at = now()
      WHERE id = _row.id;
      UPDATE public.companies SET plan_status = 'canceled' WHERE id = _row.company_id;
      _count := _count + 1;
      CONTINUE;
    END IF;

    -- Aplica plano pendente, se houver
    IF _row.pending_plan_id IS NOT NULL THEN
      SELECT * INTO _plan FROM public.subscription_plans WHERE id = _row.pending_plan_id;
      _cycle := COALESCE(_row.pending_billing_cycle, _row.billing_cycle);
      UPDATE public.subscriptions
      SET plan_id = _plan.id,
          plan_name = _plan.name,
          monthly_price = CASE WHEN _cycle = 'yearly' THEN _plan.yearly_price / 12.0 ELSE _plan.monthly_price END,
          billing_cycle = _cycle,
          pending_plan_id = NULL,
          pending_billing_cycle = NULL
      WHERE id = _row.id;
      _row.plan_id := _plan.id;
      _row.plan_name := _plan.name;
      _row.billing_cycle := _cycle;
      _row.monthly_price := CASE WHEN _cycle = 'yearly' THEN _plan.yearly_price / 12.0 ELSE _plan.monthly_price END;
    END IF;

    _new_start := _row.current_period_end;
    _new_end := CASE WHEN _row.billing_cycle = 'yearly'
                     THEN _new_start + interval '365 days'
                     ELSE _new_start + interval '30 days' END;
    _amount := CASE WHEN _row.billing_cycle = 'yearly'
                    THEN _row.monthly_price * 12.0
                    ELSE _row.monthly_price END;

    UPDATE public.subscriptions
    SET current_period_start = _new_start,
        current_period_end = _new_end,
        status = 'active',
        updated_at = now()
    WHERE id = _row.id;

    INSERT INTO public.invoices (
      company_id, subscription_id, invoice_number, amount, currency,
      billing_cycle, period_start, period_end, status, paid_at, payment_method, description
    ) VALUES (
      _row.company_id, _row.id, public.next_invoice_number(),
      _amount, 'BRL', _row.billing_cycle, _new_start, _new_end,
      'paid', now(), 'manual',
      'Renovação automática · ' || _row.plan_name
    );

    UPDATE public.companies SET plan_status = 'active'
    WHERE id = _row.company_id AND plan_status NOT IN ('active');

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_subscription_plan(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_my_subscription() TO authenticated;
