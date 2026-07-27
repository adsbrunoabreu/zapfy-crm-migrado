DROP POLICY IF EXISTS "prl_authenticated_read" ON public.provider_rate_limits;

CREATE POLICY "prl_master_read"
ON public.provider_rate_limits
FOR SELECT
TO authenticated
USING (public.is_master(auth.uid()));