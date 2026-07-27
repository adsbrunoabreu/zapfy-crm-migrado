
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS billing_run_hour smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS last_billing_sync_at timestamptz;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_billing_run_hour_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_billing_run_hour_check
  CHECK (billing_run_hour BETWEEN 0 AND 23);

CREATE OR REPLACE FUNCTION public.get_companies_due_for_billing()
RETURNS TABLE(company_id uuid, tz text, run_hour smallint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, COALESCE(c.timezone, 'America/Sao_Paulo'), c.billing_run_hour
  FROM public.companies c
  JOIN public.company_addons a
    ON a.company_id = c.id
   AND a.addon_slug = 'ai_agent'
   AND a.is_active = true
  WHERE c.plan_status IN ('active','trial')
    AND EXTRACT(HOUR FROM (now() AT TIME ZONE COALESCE(c.timezone,'America/Sao_Paulo')))::int = c.billing_run_hour
    AND (
      c.last_billing_sync_at IS NULL
      OR (c.last_billing_sync_at AT TIME ZONE COALESCE(c.timezone,'America/Sao_Paulo'))::date
         < (now() AT TIME ZONE COALESCE(c.timezone,'America/Sao_Paulo'))::date
    );
$$;
