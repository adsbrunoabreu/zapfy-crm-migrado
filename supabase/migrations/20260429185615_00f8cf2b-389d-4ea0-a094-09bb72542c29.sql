CREATE TABLE public.company_status_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  previous_status text,
  new_status text NOT NULL,
  reason text NOT NULL,
  changed_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_status_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can view audit"
ON public.company_status_audit
FOR SELECT TO authenticated
USING (public.is_master(auth.uid()));

CREATE POLICY "Masters can insert audit"
ON public.company_status_audit
FOR INSERT TO authenticated
WITH CHECK (public.is_master(auth.uid()) AND changed_by = auth.uid());

CREATE INDEX idx_company_status_audit_company ON public.company_status_audit(company_id, created_at DESC);