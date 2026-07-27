CREATE POLICY "Authenticated can insert chat telemetry"
ON public.system_logs
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND source = 'chat-frontend'
);