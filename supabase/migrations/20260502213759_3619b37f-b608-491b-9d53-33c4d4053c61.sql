
-- 1. Restrict whatsapp_templates reads to masters (it's a master-managed admin feature)
DROP POLICY IF EXISTS "Authenticated read whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Masters read whatsapp templates"
  ON public.whatsapp_templates FOR SELECT
  TO authenticated
  USING (is_master(auth.uid()));

-- 2. Allow company admins to view their own tracking_events
CREATE POLICY "Company admins view own tracking_events"
  ON public.tracking_events FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

-- 3. Tighten reactivation_requests INSERT — require requester_email matches auth user email
DROP POLICY IF EXISTS "Anyone authenticated can create reactivation requests" ON public.reactivation_requests;
CREATE POLICY "Authenticated create own reactivation request"
  ON public.reactivation_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    lower(requester_email) = lower(coalesce((auth.jwt() ->> 'email')::text, ''))
  );

-- 4. Fix function search_path
ALTER FUNCTION public.ai_agents_validate_debounce() SET search_path = public;

-- 5. Rate-limiting table for admin-data-cleanup password attempts
CREATE TABLE IF NOT EXISTS public.admin_action_attempts (
  user_id uuid NOT NULL,
  action text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, action)
);
ALTER TABLE public.admin_action_attempts ENABLE ROW LEVEL SECURITY;
-- No client policies: only service role (used by edge function) can access.
