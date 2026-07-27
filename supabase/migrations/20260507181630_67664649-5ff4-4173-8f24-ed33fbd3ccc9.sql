-- 1) coluna de finalização da conversa (independente de ticket)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_conversations_closed_at
  ON public.conversations (company_id, closed_at)
  WHERE closed_at IS NOT NULL;

-- 2) trigger para reabrir conversa quando chega/envia mensagem nova
CREATE OR REPLACE FUNCTION public.reopen_conversation_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
     SET closed_at = NULL
   WHERE id = NEW.conversation_id
     AND closed_at IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reopen_conversation_on_new_message ON public.chat_messages;
CREATE TRIGGER trg_reopen_conversation_on_new_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.reopen_conversation_on_new_message();