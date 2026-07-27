
DO $$ BEGIN
  CREATE TYPE public.webhook_audit_status AS ENUM ('received','processed','failed','ignored');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.webhook_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  instance_id uuid NULL,
  instance_name text NULL,
  provider text NOT NULL,
  event_type text NOT NULL,
  normalized_event text NULL,
  status public.webhook_audit_status NOT NULL DEFAULT 'received',
  error_message text NULL,
  external_message_id text NULL,
  raw_body jsonb NOT NULL DEFAULT '{}'::jsonb,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_audit_company_created
  ON public.webhook_audit (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_instance_created
  ON public.webhook_audit (instance_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_instance_name_created
  ON public.webhook_audit (instance_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_status
  ON public.webhook_audit (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_provider_event
  ON public.webhook_audit (provider, event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_audit_external_msg
  ON public.webhook_audit (external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_audit_raw_body
  ON public.webhook_audit USING GIN (raw_body);

ALTER TABLE public.webhook_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master can view all webhook_audit" ON public.webhook_audit;
CREATE POLICY "Master can view all webhook_audit"
  ON public.webhook_audit FOR SELECT
  TO authenticated
  USING (public.is_master(auth.uid()));

DROP POLICY IF EXISTS "Company admins can view their webhook_audit" ON public.webhook_audit;
CREATE POLICY "Company admins can view their webhook_audit"
  ON public.webhook_audit FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'company_admin'::public.app_role)
  );

COMMENT ON TABLE public.webhook_audit IS
  'Auditoria de eventos de webhook recebidos (Evolution, Meta Cloud, Shopify, Asaas, etc.). Escrita exclusiva por edge functions via service role.';
