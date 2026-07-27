-- Add is_featured flag for landing-page highlighted plan
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_single_featured
  ON public.subscription_plans ((is_featured)) WHERE is_featured = true;

-- Trigger to enforce a single featured plan: when one is set, unset others
CREATE OR REPLACE FUNCTION public.enforce_single_featured_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_featured = true THEN
    UPDATE public.subscription_plans
       SET is_featured = false
     WHERE is_featured = true
       AND id <> NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_featured_plan ON public.subscription_plans;
CREATE TRIGGER trg_enforce_single_featured_plan
BEFORE INSERT OR UPDATE OF is_featured ON public.subscription_plans
FOR EACH ROW
EXECUTE FUNCTION public.enforce_single_featured_plan();

-- Public read access to active plans (landing page anonymous visitors)
DROP POLICY IF EXISTS "Public can view active plans" ON public.subscription_plans;
CREATE POLICY "Public can view active plans"
ON public.subscription_plans
FOR SELECT
TO anon, authenticated
USING (is_active = true);