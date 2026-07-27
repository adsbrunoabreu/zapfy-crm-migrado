-- Add _already_sent parameter to mark_outbound_failed.
-- When true (message reached provider but local persist failed), set status to
-- 'sent_persist_failed' so the worker DOES NOT resend to WhatsApp.
CREATE OR REPLACE FUNCTION public.mark_outbound_failed(
  _id uuid,
  _error text,
  _already_sent boolean DEFAULT false
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_attempts int;
  v_max int;
  v_delay int;
BEGIN
  -- Provider already accepted the message: do NOT retry the send. Park it.
  IF _already_sent THEN
    UPDATE public.outbound_message_queue
       SET status = 'sent_persist_failed',
           error = _error,
           processed_at = now(),
           updated_at = now()
     WHERE id = _id;
    RETURN 'sent_persist_failed';
  END IF;

  SELECT retry_count, max_attempts INTO v_attempts, v_max
    FROM public.outbound_message_queue WHERE id = _id;

  IF v_attempts >= v_max THEN
    UPDATE public.outbound_message_queue
       SET status = 'dead', error = _error, updated_at = now()
     WHERE id = _id;
    RETURN 'dead';
  END IF;

  v_delay := LEAST(POWER(2, v_attempts)::int * 5, 600);
  UPDATE public.outbound_message_queue
     SET status = 'pending',
         error = _error,
         next_attempt_at = now() + make_interval(secs => v_delay),
         updated_at = now()
   WHERE id = _id;
  RETURN 'pending';
END $function$;

-- Index to help the idempotency lookup by client_id.
CREATE INDEX IF NOT EXISTS idx_chat_messages_company_client
  ON public.chat_messages (company_id, client_id)
  WHERE client_id IS NOT NULL;