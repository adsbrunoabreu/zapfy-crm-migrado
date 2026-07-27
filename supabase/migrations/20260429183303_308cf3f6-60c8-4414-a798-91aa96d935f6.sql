CREATE INDEX IF NOT EXISTS system_logs_created_idx
  ON public.system_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS system_logs_company_created_idx
  ON public.system_logs (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS system_logs_level_idx
  ON public.system_logs (level);

CREATE INDEX IF NOT EXISTS system_logs_source_idx
  ON public.system_logs (source);

CREATE INDEX IF NOT EXISTS system_logs_instance_idx
  ON public.system_logs (instance_name);

CREATE INDEX IF NOT EXISTS system_logs_metadata_user_idx
  ON public.system_logs ((metadata->>'user_id'));