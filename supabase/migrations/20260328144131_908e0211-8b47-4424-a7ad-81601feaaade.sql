
-- System logs table for structured logging
CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'system',
  level text NOT NULL DEFAULT 'info',
  event text NOT NULL,
  message text NOT NULL,
  instance_name text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast filtering
CREATE INDEX idx_system_logs_company_created ON public.system_logs(company_id, created_at DESC);
CREATE INDEX idx_system_logs_source_level ON public.system_logs(source, level);
CREATE INDEX idx_system_logs_instance ON public.system_logs(instance_name) WHERE instance_name IS NOT NULL;

-- Enable RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view company logs
CREATE POLICY "Company admins can view logs"
  ON public.system_logs FOR SELECT
  TO authenticated
  USING (
    (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()))
    OR is_master(auth.uid())
  );

-- Service role inserts (edge functions use service_role which bypasses RLS)
-- No INSERT policy needed for authenticated users - only edge functions insert

-- Enable realtime for live log streaming
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_logs;
