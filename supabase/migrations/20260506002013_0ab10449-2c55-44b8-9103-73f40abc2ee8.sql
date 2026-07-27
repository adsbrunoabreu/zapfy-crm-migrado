
ALTER TABLE public.store_integrations
  ADD COLUMN IF NOT EXISTS sync_cursor text,
  ADD COLUMN IF NOT EXISTS sync_page integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_processed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sync_checkpoint_at timestamptz;
