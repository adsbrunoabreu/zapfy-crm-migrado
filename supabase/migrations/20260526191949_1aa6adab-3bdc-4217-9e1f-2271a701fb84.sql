
CREATE OR REPLACE FUNCTION public.create_manual_conversation(
  _instance_id uuid,
  _instance_name text,
  _provider text,
  _remote_jid text,
  _phone text,
  _contact_name text,
  _contact_id uuid DEFAULT NULL,
  _contact_photo_url text DEFAULT NULL
)
RETURNS public.conversations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _company_id uuid;
  _uid uuid := auth.uid();
  _conv public.conversations;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _company_id := public.get_user_company_id(_uid);
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'User has no company';
  END IF;

  IF NOT public.is_company_active(_company_id) THEN
    RAISE EXCEPTION 'Company plan is not active';
  END IF;

  -- Tenta encontrar conversa existente
  SELECT * INTO _conv
  FROM public.conversations
  WHERE company_id = _company_id
    AND instance_name = _instance_name
    AND remote_jid = _remote_jid
  LIMIT 1;

  IF FOUND THEN
    -- Atualiza foto se faltava
    IF _contact_photo_url IS NOT NULL AND _conv.contact_photo_url IS NULL THEN
      UPDATE public.conversations
         SET contact_photo_url = _contact_photo_url
       WHERE id = _conv.id;
      _conv.contact_photo_url := _contact_photo_url;
    END IF;
    RETURN _conv;
  END IF;

  INSERT INTO public.conversations (
    company_id, instance_name, instance_id, provider,
    remote_jid, phone, contact_name, contact_id,
    contact_photo_url, unread_count, is_archived,
    assigned_to, assigned_at
  ) VALUES (
    _company_id, _instance_name, _instance_id, COALESCE(_provider,'evolution'),
    _remote_jid, _phone, _contact_name, _contact_id,
    _contact_photo_url, 0, false,
    _uid, now()
  )
  RETURNING * INTO _conv;

  RETURN _conv;
END;
$$;

REVOKE ALL ON FUNCTION public.create_manual_conversation(uuid, text, text, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_manual_conversation(uuid, text, text, text, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_conversation(uuid, text, text, text, text, text, uuid, text) TO service_role;
