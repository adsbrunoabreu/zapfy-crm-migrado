ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS instance_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_webhooks_instance_ids
  ON public.webhooks USING GIN (instance_ids);