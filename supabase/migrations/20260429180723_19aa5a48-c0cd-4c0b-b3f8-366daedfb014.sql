-- Subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  plan_name TEXT NOT NULL DEFAULT 'Starter',
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly','yearly')),
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('active','trialing','canceled','past_due')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_company_id ON public.subscriptions(company_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);

-- Only one active/trialing subscription per company
CREATE UNIQUE INDEX idx_subscriptions_one_active_per_company
  ON public.subscriptions(company_id)
  WHERE status IN ('active','trialing','past_due');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Master full management
CREATE POLICY "Masters can manage subscriptions"
  ON public.subscriptions FOR ALL
  USING (public.is_master(auth.uid()))
  WITH CHECK (public.is_master(auth.uid()));

-- Company admins can view their own company subscription
CREATE POLICY "Company admins can view own subscription"
  ON public.subscriptions FOR SELECT
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_admin(auth.uid())
  );

-- updated_at trigger
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- MRR function (master only — checked inside)
CREATE OR REPLACE FUNCTION public.get_platform_mrr()
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _mrr NUMERIC;
BEGIN
  IF NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(SUM(
    CASE WHEN billing_cycle = 'yearly' THEN monthly_price / 12.0
         ELSE monthly_price END
  ), 0)
  INTO _mrr
  FROM public.subscriptions
  WHERE status = 'active';

  RETURN _mrr;
END;
$$;