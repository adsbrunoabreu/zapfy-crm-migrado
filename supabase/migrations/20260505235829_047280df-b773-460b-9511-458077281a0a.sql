
-- Fila de jobs
CREATE TABLE public.store_integration_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  store_integration_id UUID,
  job_type TEXT NOT NULL CHECK (job_type IN ('test','sync','webhooks','initial_sync','rotate_webhooks')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sij_company ON public.store_integration_jobs(company_id, created_at DESC);
CREATE INDEX idx_sij_dispatch ON public.store_integration_jobs(status, next_run_at) WHERE status IN ('pending','running');

ALTER TABLE public.store_integration_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_jobs_select_own_or_master"
ON public.store_integration_jobs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'master') OR company_id = public.get_user_company_id(auth.uid()));

CREATE TRIGGER trg_sij_updated_at
BEFORE UPDATE ON public.store_integration_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Logs de auditoria
CREATE TABLE public.store_integration_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  store_integration_id UUID,
  job_id UUID,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error')),
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sil_company ON public.store_integration_logs(company_id, created_at DESC);
CREATE INDEX idx_sil_job ON public.store_integration_logs(job_id) WHERE job_id IS NOT NULL;

ALTER TABLE public.store_integration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_logs_select_own_or_master"
ON public.store_integration_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'master') OR company_id = public.get_user_company_id(auth.uid()));
