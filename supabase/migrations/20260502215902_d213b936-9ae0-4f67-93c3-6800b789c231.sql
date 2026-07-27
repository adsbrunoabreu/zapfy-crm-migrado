CREATE INDEX IF NOT EXISTS idx_attendance_queue_company_status_pending
  ON public.attendance_auto_message_queue(company_id, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_leads_company_phone
  ON public.leads(company_id, phone)
  WHERE phone IS NOT NULL;