CREATE TABLE public.instance_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'company',
  company_id UUID,
  event_type TEXT NOT NULL,
  previous_state TEXT,
  new_state TEXT,
  down_since TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_instance_events_instance ON public.instance_events(instance_name, created_at DESC);
CREATE INDEX idx_instance_events_company ON public.instance_events(company_id, created_at DESC);
CREATE INDEX idx_instance_events_type ON public.instance_events(event_type, created_at DESC);

ALTER TABLE public.instance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can view all instance events"
ON public.instance_events FOR SELECT
TO authenticated
USING (is_master(auth.uid()));

CREATE POLICY "Company admins can view own instance events"
ON public.instance_events FOR SELECT
TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));