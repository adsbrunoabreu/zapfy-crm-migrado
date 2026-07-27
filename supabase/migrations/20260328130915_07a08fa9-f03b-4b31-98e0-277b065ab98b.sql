
-- Table: conversations
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_name text NOT NULL,
  remote_jid text NOT NULL,
  phone text NOT NULL,
  contact_name text,
  contact_photo_url text,
  last_message_text text,
  last_message_at timestamptz,
  unread_count integer NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, instance_name, remote_jid)
);

-- Table: chat_messages
CREATE TABLE public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  remote_jid text NOT NULL,
  message_id text NOT NULL,
  from_me boolean NOT NULL DEFAULT false,
  message_type text NOT NULL DEFAULT 'text',
  content text,
  media_url text,
  media_mimetype text,
  file_name text,
  duration integer,
  latitude double precision,
  longitude double precision,
  quoted_message_id text,
  reaction_emoji text,
  status text NOT NULL DEFAULT 'sent',
  sender_name text,
  "timestamp" timestamptz NOT NULL,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, message_id)
);

-- Indexes
CREATE INDEX idx_conversations_company ON public.conversations(company_id);
CREATE INDEX idx_conversations_last_msg ON public.conversations(company_id, last_message_at DESC NULLS LAST);
CREATE INDEX idx_chat_messages_conversation ON public.chat_messages(conversation_id, "timestamp" DESC);
CREATE INDEX idx_chat_messages_company ON public.chat_messages(company_id);
CREATE INDEX idx_chat_messages_remote_jid ON public.chat_messages(company_id, remote_jid);

-- RLS: conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company conversations"
  ON public.conversations FOR SELECT TO public
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Service can insert conversations"
  ON public.conversations FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Service can update conversations"
  ON public.conversations FOR UPDATE TO public
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Masters can manage all conversations"
  ON public.conversations FOR ALL TO public
  USING (is_master(auth.uid()));

-- RLS: chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view company messages"
  ON public.chat_messages FOR SELECT TO public
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Service can insert messages"
  ON public.chat_messages FOR INSERT TO public
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Service can update messages"
  ON public.chat_messages FOR UPDATE TO public
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Masters can manage all messages"
  ON public.chat_messages FOR ALL TO public
  USING (is_master(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Updated_at trigger for conversations
CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
