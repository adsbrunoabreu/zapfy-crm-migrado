
CREATE OR REPLACE FUNCTION public.sync_conversation_closed_at_from_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _was_closed boolean := OLD.status IN ('closed','awaiting_rating');
  _is_closed  boolean := NEW.status IN ('closed','awaiting_rating');
BEGIN
  IF NEW.conversation_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fechou agora
  IF _is_closed AND NOT _was_closed THEN
    UPDATE public.conversations
       SET closed_at = COALESCE(NEW.closed_at, now())
     WHERE id = NEW.conversation_id
       AND closed_at IS NULL;

  -- Reabriu agora
  ELSIF _was_closed AND NOT _is_closed THEN
    UPDATE public.conversations
       SET closed_at = NULL
     WHERE id = NEW.conversation_id
       AND closed_at IS NOT NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_conversation_closed_at_from_ticket ON public.attendance_tickets;
CREATE TRIGGER trg_sync_conversation_closed_at_from_ticket
AFTER UPDATE OF status ON public.attendance_tickets
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.sync_conversation_closed_at_from_ticket();
