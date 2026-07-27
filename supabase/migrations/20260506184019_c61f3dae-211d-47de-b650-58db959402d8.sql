DROP POLICY IF EXISTS "System can insert ticket events" ON public.attendance_ticket_events;

CREATE POLICY "Company members can insert ticket events"
ON public.attendance_ticket_events
FOR INSERT
WITH CHECK (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
  )
);