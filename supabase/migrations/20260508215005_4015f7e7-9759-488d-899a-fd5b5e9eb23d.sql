-- Adiciona seq monotônico para ordenação consistente das mensagens
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS seq BIGSERIAL;

-- Index para ordenação por conversa
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_seq
  ON public.chat_messages (conversation_id, seq);

-- Index para catch-up por empresa
CREATE INDEX IF NOT EXISTS idx_chat_messages_company_seq
  ON public.chat_messages (company_id, seq);
