CREATE OR REPLACE FUNCTION public.mark_all_conversations_read(_conversation_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _company uuid;
  _affected integer := 0;
  _ids uuid[];
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT company_id INTO _company FROM public.profiles WHERE id = _uid LIMIT 1;
  IF _company IS NULL AND NOT is_master() THEN
    RAISE EXCEPTION 'No company context';
  END IF;

  -- Filter to conversations the user can access
  SELECT array_agg(c.id) INTO _ids
  FROM public.conversations c
  WHERE c.unread_count > 0
    AND (_conversation_ids IS NULL OR c.id = ANY(_conversation_ids))
    AND (is_master() OR (c.company_id = _company AND user_can_view_conversation(c.id, _uid)));

  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.chat_messages
    SET status = 'read'
    WHERE conversation_id = ANY(_ids)
      AND from_me = false
      AND COALESCE(status, '') NOT IN ('read', 'played');

  UPDATE public.conversations
    SET unread_count = 0
    WHERE id = ANY(_ids);

  GET DIAGNOSTICS _affected = ROW_COUNT;
  RETURN _affected;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_all_conversations_read(uuid[]) TO authenticated;