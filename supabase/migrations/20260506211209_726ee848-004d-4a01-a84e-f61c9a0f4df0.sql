DROP POLICY IF EXISTS "Company admins view active plans" ON public.subscription_plans;
DROP POLICY IF EXISTS "Masters manage plans" ON public.subscription_plans;

CREATE POLICY "Company admins view active plans"
ON public.subscription_plans FOR SELECT
TO authenticated
USING (is_master(auth.uid()) OR (is_active = true AND is_company_admin(auth.uid())));

CREATE POLICY "Masters manage plans"
ON public.subscription_plans FOR ALL
TO authenticated
USING (is_master(auth.uid()))
WITH CHECK (is_master(auth.uid()));