CREATE OR REPLACE FUNCTION public.set_trial_ends_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.plan_status = 'trial' AND NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := now() + interval '1 day';
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.get_company_trial_info(uuid);

CREATE OR REPLACE FUNCTION public.get_company_trial_info(_company_id uuid)
RETURNS TABLE (
  plan_status text,
  trial_ends_at timestamptz,
  days_left integer,
  hours_left integer,
  expired boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c.plan_status::text,
    c.trial_ends_at,
    GREATEST(0, CEIL(EXTRACT(EPOCH FROM (c.trial_ends_at - now())) / 86400))::int,
    GREATEST(0, CEIL(EXTRACT(EPOCH FROM (c.trial_ends_at - now())) / 3600))::int,
    (c.plan_status = 'trial' AND c.trial_ends_at IS NOT NULL AND c.trial_ends_at <= now())
  FROM public.companies c WHERE c.id = _company_id;
$$;

UPDATE public.companies
SET trial_ends_at = LEAST(trial_ends_at, now() + interval '1 day')
WHERE plan_status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at > now();