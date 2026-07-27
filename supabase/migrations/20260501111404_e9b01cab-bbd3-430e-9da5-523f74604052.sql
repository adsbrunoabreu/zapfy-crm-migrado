
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS media_storage_path text;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS contact_storage_path text;

CREATE INDEX IF NOT EXISTS idx_chat_messages_media_storage_path
  ON public.chat_messages(media_storage_path)
  WHERE media_storage_path IS NOT NULL;
