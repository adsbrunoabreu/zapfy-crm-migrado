
-- 1. Add trial_ends_at to companies
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

-- Backfill existing trial companies: give 3 days from now if null
UPDATE public.companies 
SET trial_ends_at = now() + interval '3 days'
WHERE plan_status = 'trial' AND trial_ends_at IS NULL;

-- Trigger to auto-set trial_ends_at on insert
CREATE OR REPLACE FUNCTION public.set_trial_ends_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_status = 'trial' AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := now() + interval '3 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_set_trial_ends_at ON public.companies;
CREATE TRIGGER companies_set_trial_ends_at
BEFORE INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.set_trial_ends_at();

-- Update is_company_active to honor trial expiration
CREATE OR REPLACE FUNCTION public.is_company_active(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id
      AND (
        plan_status = 'active'
        OR (plan_status = 'trial' AND (trial_ends_at IS NULL OR trial_ends_at > now()))
      )
  );
$$;

-- RPC for trial info
CREATE OR REPLACE FUNCTION public.get_company_trial_info(_company_id uuid)
RETURNS TABLE (
  plan_status text,
  trial_ends_at timestamptz,
  days_left integer,
  expired boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.plan_status::text,
    c.trial_ends_at,
    GREATEST(0, CEIL(EXTRACT(EPOCH FROM (c.trial_ends_at - now())) / 86400))::int AS days_left,
    (c.plan_status = 'trial' AND c.trial_ends_at IS NOT NULL AND c.trial_ends_at <= now()) AS expired
  FROM public.companies c
  WHERE c.id = _company_id;
$$;

-- 2. Onboarding tracking table
CREATE TABLE IF NOT EXISTS public.company_onboarding (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  current_step SMALLINT NOT NULL DEFAULT 1,
  completed_steps TEXT[] NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  skipped BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.company_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view onboarding"
ON public.company_onboarding FOR SELECT
USING (
  company_id = public.get_user_company_id(auth.uid())
  OR public.has_role(auth.uid(), 'master')
);

CREATE POLICY "Company admins can update onboarding"
ON public.company_onboarding FOR UPDATE
USING (
  (company_id = public.get_user_company_id(auth.uid()) AND public.has_role(auth.uid(), 'company_admin'))
  OR public.has_role(auth.uid(), 'master')
);

CREATE POLICY "Service role can insert onboarding"
ON public.company_onboarding FOR INSERT
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  OR public.has_role(auth.uid(), 'master')
);

-- Auto-create onboarding row when company is created
CREATE OR REPLACE FUNCTION public.create_company_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_onboarding (company_id, current_step, completed_steps)
  VALUES (NEW.id, 2, ARRAY['company'])
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_create_onboarding ON public.companies;
CREATE TRIGGER companies_create_onboarding
AFTER INSERT ON public.companies
FOR EACH ROW EXECUTE FUNCTION public.create_company_onboarding();

-- Backfill onboarding rows for existing companies (mark as completed to not bother existing users)
INSERT INTO public.company_onboarding (company_id, current_step, completed_steps, completed_at)
SELECT id, 5, ARRAY['company','whatsapp','pipeline','team']::text[], now()
FROM public.companies
ON CONFLICT (company_id) DO NOTHING;

-- updated_at trigger
CREATE TRIGGER company_onboarding_updated_at
BEFORE UPDATE ON public.company_onboarding
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
