CREATE OR REPLACE FUNCTION public.unarchive_and_reopen_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_archived BOOLEAN;
BEGIN
  SELECT is_archived INTO _is_archived
    FROM public.conversations
   WHERE id = NEW.conversation_id;

  IF _is_archived IS TRUE THEN
    UPDATE public.conversations
       SET is_archived = false,
           updated_at = now()
     WHERE id = NEW.conversation_id;
  END IF;

  UPDATE public.attendance_tickets
     SET status = 'reopened'::ticket_status,
         reopened_at = now(),
         closed_at = NULL,
         closed_by = NULL,
         close_reason = NULL,
         close_notes = NULL
   WHERE conversation_id = NEW.conversation_id
     AND status = 'closed'
     AND id = (
       SELECT id FROM public.attendance_tickets
        WHERE conversation_id = NEW.conversation_id
        ORDER BY created_at DESC
        LIMIT 1
     );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unarchive_reopen_on_message ON public.chat_messages;

CREATE TRIGGER trg_unarchive_reopen_on_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.unarchive_and_reopen_on_message();