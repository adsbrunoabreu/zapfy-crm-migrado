ALTER TABLE public.webhook_retry_queue DROP CONSTRAINT IF EXISTS webhook_retry_queue_kind_check;
ALTER TABLE public.webhook_retry_queue ADD CONSTRAINT webhook_retry_queue_kind_check
  CHECK (kind = ANY (ARRAY['persist_message'::text, 'status_update'::text, 'download_media'::text]));