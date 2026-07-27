
CREATE TABLE IF NOT EXISTS public.asaas_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('proxy_request','webhook_in')),
  action text,
  event text,
  http_status integer,
  ok boolean NOT NULL DEFAULT false,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  environment text,
  asaas_payment_id text,
  retry_of uuid REFERENCES public.asaas_logs(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asaas_logs_company_created ON public.asaas_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asaas_logs_created ON public.asaas_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asaas_logs_failures ON public.asaas_logs(created_at DESC) WHERE ok = false;
CREATE INDEX IF NOT EXISTS idx_asaas_logs_direction ON public.asaas_logs(direction, created_at DESC);

ALTER TABLE public.asaas_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master sees all asaas logs" ON public.asaas_logs;
CREATE POLICY "Master sees all asaas logs" ON public.asaas_logs
  FOR SELECT TO authenticated
  USING (is_master(auth.uid()));

DROP POLICY IF EXISTS "Company admin sees own asaas logs" ON public.asaas_logs;
CREATE POLICY "Company admin sees own asaas logs" ON public.asaas_logs
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.cleanup_asaas_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.asaas_logs WHERE created_at < now() - interval '30 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

INSERT INTO public.log_retention_policies (table_name, hot_days, archive_days, archive_enabled, enabled)
VALUES ('asaas_logs', 30, 90, false, true)
ON CONFLICT (table_name) DO NOTHING;
