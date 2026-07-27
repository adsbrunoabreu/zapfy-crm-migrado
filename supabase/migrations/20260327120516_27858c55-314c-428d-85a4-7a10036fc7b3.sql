
-- Table to track when each user last read a conversation
CREATE TABLE public.chat_read_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  last_read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, lead_id)
);

-- Enable RLS
ALTER TABLE public.chat_read_status ENABLE ROW LEVEL SECURITY;

-- Users can view their own read status
CREATE POLICY "Users can view own read status"
  ON public.chat_read_status FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can upsert their own read status
CREATE POLICY "Users can upsert own read status"
  ON public.chat_read_status FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own read status"
  ON public.chat_read_status FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_read_status;
