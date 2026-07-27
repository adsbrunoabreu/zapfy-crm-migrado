ALTER TABLE public.store_integrations
  ADD COLUMN IF NOT EXISTS sync_phase text,
  ADD COLUMN IF NOT EXISTS sync_progress integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_error text,
  ADD COLUMN IF NOT EXISTS presentment_currencies jsonb NOT NULL DEFAULT '[]'::jsonb;