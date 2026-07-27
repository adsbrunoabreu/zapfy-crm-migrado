CREATE OR REPLACE FUNCTION public.remove_team_member(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _caller_company uuid;
  _target_company uuid;
  _is_master boolean;
  _target_is_master boolean;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required';
  END IF;
  IF _user_id = _caller THEN
    RAISE EXCEPTION 'cannot remove yourself';
  END IF;

  _is_master := public.is_master(_caller);
  _caller_company := public.get_user_company_id(_caller);

  SELECT company_id INTO _target_company FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  _target_is_master := EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'master'::app_role
  );
  IF _target_is_master THEN
    RAISE EXCEPTION 'cannot remove a master user';
  END IF;

  IF NOT _is_master THEN
    IF _caller_company IS NULL OR _target_company IS NULL OR _caller_company <> _target_company THEN
      RAISE EXCEPTION 'access denied';
    END IF;
    IF NOT public.has_role(_caller, 'company_admin'::app_role) THEN
      RAISE EXCEPTION 'access denied';
    END IF;
  END IF;

  -- Desatribuições operacionais
  UPDATE public.leads SET assigned_to = NULL WHERE assigned_to = _user_id;
  UPDATE public.attendance_tickets SET assigned_to = NULL
    WHERE assigned_to = _user_id AND status <> 'closed';

  -- Vínculos
  DELETE FROM public.instance_agents WHERE user_id = _user_id;
  DELETE FROM public.lead_distribution_users WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role <> 'master'::app_role;

  -- Desvincula da empresa e desativa
  UPDATE public.profiles
     SET company_id = NULL,
         is_active = false,
         role = 'user'
   WHERE id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_team_member(uuid) TO authenticated;