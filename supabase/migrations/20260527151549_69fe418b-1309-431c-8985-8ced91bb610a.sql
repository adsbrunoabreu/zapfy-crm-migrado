UPDATE public.chat_messages
SET media_url = NULL
WHERE message_type IN ('audio','image','video','document','sticker')
  AND media_storage_path IS NOT NULL
  AND media_url LIKE '%/storage/v1/object/sign/%';