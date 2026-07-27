CREATE OR REPLACE FUNCTION public.is_company_active(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id
      AND (
        plan_status = 'active'
        OR (
          plan_status = 'trial'
          AND (trial_ends_at IS NULL OR trial_ends_at > now())
        )
      )
  )
$$;