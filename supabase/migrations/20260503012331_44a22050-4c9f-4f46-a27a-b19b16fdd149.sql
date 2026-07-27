
ALTER TABLE public.conversation_ai_state
  ADD COLUMN IF NOT EXISTS manual_status text,
  ADD COLUMN IF NOT EXISTS manual_status_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS manual_status_set_by uuid;

-- Allow company admins to update manual_status fields (UPDATE policy already exists for members, just ensure it's there)
-- The existing "Company members update ai_state" policy covers this.
