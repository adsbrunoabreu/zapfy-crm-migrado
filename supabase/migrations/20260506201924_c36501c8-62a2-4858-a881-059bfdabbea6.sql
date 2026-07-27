-- 1) Profiles: revoke column-level UPDATE on sensitive columns from regular users.
-- This is the strongest guarantee: even if the row policy passes, the column grant fails.
REVOKE UPDATE (role, company_id) ON public.profiles FROM authenticated, anon;
-- Service role (used by edge functions and triggers) is unaffected.

-- 2) Ticket events: restrict INSERT to authenticated role only (was public)
DROP POLICY IF EXISTS "Company members can insert ticket events" ON public.attendance_ticket_events;
CREATE POLICY "Company members can insert ticket events"
ON public.attendance_ticket_events
FOR INSERT
TO authenticated
WITH CHECK (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
  )
);

-- 3) Store integrations: restrict SELECT to company admins / masters only.
-- The `credentials` and `webhook_secret` columns must not be readable by regular members.
DROP POLICY IF EXISTS store_integrations_select ON public.store_integrations;
CREATE POLICY store_integrations_select
ON public.store_integrations
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'master'::app_role)
  OR (
    has_role(auth.uid(), 'company_admin'::app_role)
    AND company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
  )
);