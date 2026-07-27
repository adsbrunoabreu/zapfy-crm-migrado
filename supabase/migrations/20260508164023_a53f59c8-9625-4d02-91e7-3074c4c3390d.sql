CREATE OR REPLACE FUNCTION public.get_user_unread_conversations_count()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid := public.get_current_user_company_id();
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_count integer;
BEGIN
  IF v_company IS NULL OR v_uid IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT public.is_company_active(v_company) THEN
    RETURN 0;
  END IF;

  v_is_admin := public.has_role(v_uid, 'master')
             OR public.has_role(v_uid, 'company_admin');

  SELECT count(*) INTO v_count
  FROM public.conversations c
  WHERE c.company_id = v_company
    AND c.is_archived = false
    AND c.unread_count > 0
    AND (
      v_is_admin
      OR c.assigned_to = v_uid
      OR c.assigned_to IS NULL
    );

  RETURN coalesce(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_unread_conversations_count() TO authenticated;