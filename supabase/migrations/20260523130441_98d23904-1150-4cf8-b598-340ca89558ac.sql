CREATE INDEX IF NOT EXISTS idx_chat_messages_company_conversation_seq 
  ON public.chat_messages (company_id, conversation_id, seq DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_provider_msg_id 
  ON public.chat_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_company_status_created 
  ON public.chat_messages (company_id, status, created_at DESC);