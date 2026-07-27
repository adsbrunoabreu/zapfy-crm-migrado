
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz NULL;

CREATE OR REPLACE FUNCTION public.tg_chat_messages_handle_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_id uuid;
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    -- marca a edição (caller pode setar explicitamente; preserva valor explícito)
    IF NEW.edited_at IS NULL OR NEW.edited_at = OLD.edited_at THEN
      NEW.edited_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_handle_edit ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_handle_edit
BEFORE UPDATE OF content ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.tg_chat_messages_handle_edit();

CREATE OR REPLACE FUNCTION public.tg_chat_messages_sync_last_preview()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  last_id uuid;
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content THEN
    SELECT id INTO last_id
    FROM public.chat_messages
    WHERE conversation_id = NEW.conversation_id
    ORDER BY timestamp DESC NULLS LAST, seq DESC
    LIMIT 1;

    IF last_id = NEW.id THEN
      UPDATE public.conversations
      SET last_message_text = LEFT(COALESCE(NEW.content, ''), 200),
          updated_at = now()
      WHERE id = NEW.conversation_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_chat_messages_sync_last_preview ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_sync_last_preview
AFTER UPDATE OF content ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.tg_chat_messages_sync_last_preview();
