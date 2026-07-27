
CREATE OR REPLACE FUNCTION public.accept_invite(_invite_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite RECORD;
  _user_email TEXT;
BEGIN
  -- CRITICAL: Verify caller is the user being modified
  IF _user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: can only accept invites for yourself';
  END IF;

  -- Get pending invite (also check expiration)
  SELECT * INTO _invite FROM public.team_invites
  WHERE id = _invite_id AND status = 'pending' AND expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite not found or expired';
  END IF;

  -- Verify invite email matches user email
  SELECT email INTO _user_email FROM auth.users WHERE id = _user_id;
  IF lower(_invite.email) != lower(_user_email) THEN
    RAISE EXCEPTION 'Invite email does not match user email';
  END IF;

  -- Update user profile
  UPDATE public.profiles
  SET company_id = _invite.company_id, role = _invite.role
  WHERE id = _user_id;

  -- Add role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _invite.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Mark invite accepted
  UPDATE public.team_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = _invite_id;
END;
$$;
