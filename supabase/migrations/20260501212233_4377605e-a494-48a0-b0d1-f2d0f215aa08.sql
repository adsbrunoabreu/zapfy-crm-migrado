ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS responded_at timestamp with time zone;
CREATE INDEX IF NOT EXISTS idx_leads_company_responded_at ON public.leads(company_id, responded_at) WHERE responded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_company_created_at ON public.leads(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_company_assigned_to ON public.leads(company_id, assigned_to);