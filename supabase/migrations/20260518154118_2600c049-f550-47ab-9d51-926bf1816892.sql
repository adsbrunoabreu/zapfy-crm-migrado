
-- ─────────────────────────────────────────────────────────────────────────
-- P0.1 — mark_webhook_retry_failed: be patient with 'message_not_found_yet'
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_webhook_retry_failed(_id uuid, _error text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q public.webhook_retry_queue%ROWTYPE;
  next_attempts int;
  delay_seconds numeric;
  jitter numeric;
  age_seconds numeric;
BEGIN
  SELECT * INTO q FROM public.webhook_retry_queue WHERE id = _id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Caso especial: status_update aguardando a mensagem ser persistida.
  -- Não conta como tentativa real; reagenda a cada 60s por até 30min.
  IF q.kind = 'status_update' AND _error = 'message_not_found_yet' THEN
    age_seconds := EXTRACT(EPOCH FROM (now() - q.created_at));
    IF age_seconds < 1800 THEN
      UPDATE public.webhook_retry_queue
      SET last_error = _error,
          next_attempt_at = now() + interval '60 seconds',
          picked_at = NULL,
          status = 'pending'
      WHERE id = _id;
      RETURN 'pending';
    END IF;
    -- Passou de 30min sem mensagem → marca dead com causa clara.
    UPDATE public.webhook_retry_queue
    SET last_error = 'message_not_found_yet_timeout',
        status = 'dead',
        picked_at = NULL
    WHERE id = _id;
    RETURN 'dead';
  END IF;

  next_attempts := q.attempts + 1;

  IF next_attempts >= q.max_attempts THEN
    UPDATE public.webhook_retry_queue
    SET attempts = next_attempts,
        last_error = _error,
        status = 'dead',
        picked_at = NULL
    WHERE id = _id;
    RETURN 'dead';
  END IF;

  delay_seconds := CASE next_attempts
    WHEN 1 THEN 30
    WHEN 2 THEN 60
    WHEN 3 THEN 120
    WHEN 4 THEN 300
    WHEN 5 THEN 900
    WHEN 6 THEN 1800
    ELSE 3600
  END;
  jitter := (random() * 0.4 - 0.2);
  delay_seconds := delay_seconds * (1 + jitter);

  UPDATE public.webhook_retry_queue
  SET attempts = next_attempts,
      last_error = _error,
      next_attempt_at = now() + (delay_seconds || ' seconds')::interval,
      picked_at = NULL,
      status = 'pending'
  WHERE id = _id;
  RETURN 'pending';
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- P0.2 — Trigger: ao inserir chat_message, drena status_updates pendentes
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.flush_pending_status_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  q RECORD;
  target_status text;
BEGIN
  FOR q IN
    SELECT id, payload
    FROM public.webhook_retry_queue
    WHERE company_id = NEW.company_id
      AND message_id = NEW.message_id
      AND kind = 'status_update'
      AND status = 'pending'
  LOOP
    target_status := COALESCE((q.payload ->> 'status'), '');
    IF target_status <> '' THEN
      PERFORM public.set_chat_message_status(
        _message_id := NEW.message_id,
        _company_id := NEW.company_id,
        _status := target_status
      );
    END IF;
    UPDATE public.webhook_retry_queue
    SET status = 'done',
        picked_at = NULL,
        updated_at = now()
    WHERE id = q.id;
  END LOOP;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_chat_messages_flush_pending_acks ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_flush_pending_acks
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.flush_pending_status_updates();

-- ─────────────────────────────────────────────────────────────────────────
-- P0.3 — Backfill dos 186 dead em webhook_retry_queue
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  q RECORD;
  target_status text;
  msg_exists boolean;
  applied int := 0;
  cancelled int := 0;
BEGIN
  FOR q IN
    SELECT id, company_id, message_id, payload
    FROM public.webhook_retry_queue
    WHERE status = 'dead'
      AND kind = 'status_update'
      AND last_error = 'message_not_found_yet'
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.chat_messages
      WHERE company_id = q.company_id AND message_id = q.message_id
    ) INTO msg_exists;

    target_status := COALESCE((q.payload ->> 'status'), '');

    IF msg_exists AND target_status <> '' THEN
      PERFORM public.set_chat_message_status(
        _message_id := q.message_id,
        _company_id := q.company_id,
        _status := target_status
      );
      UPDATE public.webhook_retry_queue
      SET status = 'done',
          last_error = 'backfill_applied',
          updated_at = now()
      WHERE id = q.id;
      applied := applied + 1;
    ELSE
      UPDATE public.webhook_retry_queue
      SET status = 'cancelled',
          last_error = 'message_never_arrived',
          updated_at = now()
      WHERE id = q.id;
      cancelled := cancelled + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'webhook_retry_queue backfill: applied=%, cancelled=%', applied, cancelled;
END $$;
