CREATE OR REPLACE FUNCTION public.get_user_unread_conversations_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_company uuid;
  v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  v_company := public.get_user_company_id(v_uid);

  IF v_company IS NULL THEN
    RETURN 0;
  END IF;

  IF NOT public.is_company_active(v_company) THEN
    RETURN 0;
  END IF;

  SELECT count(*)::integer
    INTO v_count
  FROM public.conversations c
  WHERE c.company_id = v_company
    AND c.is_archived = false
    AND COALESCE(c.unread_count, 0) > 0
    AND public.user_has_instance_access(v_uid, c.instance_id);

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_unread_conversations_count() TO authenticated;