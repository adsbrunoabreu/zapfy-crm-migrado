-- Índice para deduplicação de mensagens (external_id)
CREATE INDEX IF NOT EXISTS idx_chat_messages_external_id
  ON public.chat_messages (external_id)
  WHERE external_id IS NOT NULL;

-- Índice composto para a query principal do chat (lead_id + sent_at)
CREATE INDEX IF NOT EXISTS idx_chat_messages_lead_sent
  ON public.chat_messages (lead_id, sent_at DESC);

-- Índice para filtro de direção (inbound/outbound)
CREATE INDEX IF NOT EXISTS idx_chat_messages_direction
  ON public.chat_messages (company_id, direction);

-- Índice para leads com filtro por instância (usado no useChatContacts)
CREATE INDEX IF NOT EXISTS idx_leads_instance_updated
  ON public.leads (whatsapp_instance_id, updated_at DESC)
  WHERE phone IS NOT NULL;