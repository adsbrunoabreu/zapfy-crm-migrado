ALTER TABLE public.store_integrations
  ADD COLUMN IF NOT EXISTS token_last4 text,
  ADD COLUMN IF NOT EXISTS token_rotated_at timestamptz;