
ALTER TABLE public.store_integrations
  ADD COLUMN IF NOT EXISTS webhook_secret text,
  ADD COLUMN IF NOT EXISTS webhooks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS webhooks_registered_at timestamptz;

CREATE TABLE IF NOT EXISTS public.store_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_integration_id uuid NOT NULL REFERENCES public.store_integrations(id) ON DELETE CASCADE,
  topic text NOT NULL,
  external_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_webhook_events_company ON public.store_webhook_events(company_id);
CREATE INDEX IF NOT EXISTS idx_store_webhook_events_topic ON public.store_webhook_events(topic, created_at DESC);

ALTER TABLE public.store_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_webhook_events_select" ON public.store_webhook_events;
CREATE POLICY "store_webhook_events_select" ON public.store_webhook_events
  FOR SELECT USING (
    has_role(auth.uid(), 'master'::app_role)
    OR (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()))
  );
