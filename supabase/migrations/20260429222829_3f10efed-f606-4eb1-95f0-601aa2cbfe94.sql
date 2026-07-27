DROP POLICY IF EXISTS "Company admins can view attendance settings" ON public.attendance_settings;

CREATE POLICY "Company members can view attendance settings"
ON public.attendance_settings
FOR SELECT
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
);