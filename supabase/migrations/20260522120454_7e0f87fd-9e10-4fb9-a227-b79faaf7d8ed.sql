-- mark_conversation_read: zera unread_count e marca mensagens recebidas como 'read'
CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _instance_id uuid;
  _lead_id uuid;
BEGIN
  SELECT company_id, instance_id, lead_id
    INTO _company_id, _instance_id, _lead_id
    FROM public.conversations
   WHERE id = _conversation_id;

  IF _company_id IS NULL THEN
    RETURN;
  END IF;

  -- Validação de acesso: usuário precisa poder ver essa conversa
  IF NOT (
    public.is_master(auth.uid())
    OR public.user_can_view_conversation(auth.uid(), _company_id, _instance_id, _lead_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Zera contador
  UPDATE public.conversations
     SET unread_count = 0
   WHERE id = _conversation_id
     AND COALESCE(unread_count, 0) > 0;

  -- Marca últimas mensagens recebidas como 'read' (sem regredir status já 'played')
  UPDATE public.chat_messages
     SET status = 'read'
   WHERE conversation_id = _conversation_id
     AND from_me = false
     AND COALESCE(status, '') NOT IN ('read', 'played');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated, service_role;