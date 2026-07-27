
-- Drop insecure policies
DROP POLICY IF EXISTS "Anyone can read invite by token" ON public.team_invites;
DROP POLICY IF EXISTS "Company admins can manage invites" ON public.team_invites;

-- Ensure RLS is enabled
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- Company members can view their company's invites
CREATE POLICY "Company members can view invites"
ON public.team_invites
FOR SELECT
USING (
  company_id = get_user_company_id(auth.uid())
);

-- Admin/master can insert invites
CREATE POLICY "Admin can insert invites"
ON public.team_invites
FOR INSERT
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_admin(auth.uid())
);

-- Admin/master can update invites (cancel etc)
CREATE POLICY "Admin can update invites"
ON public.team_invites
FOR UPDATE
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_admin(auth.uid())
);

-- Admin/master can delete invites
CREATE POLICY "Admin can delete invites"
ON public.team_invites
FOR DELETE
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_admin(auth.uid())
);

-- Secure RPC function to check pending invite by email (used during signup before auth)
CREATE OR REPLACE FUNCTION public.check_pending_invite_by_email(_email text)
RETURNS TABLE(id uuid, company_id uuid, role app_role, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ti.id, ti.company_id, ti.role, ti.email
  FROM public.team_invites ti
  WHERE ti.email = lower(_email)
    AND ti.status = 'pending'
    AND ti.expires_at > now()
  LIMIT 1;
$$;

-- Secure RPC function to accept invite (used right after signup)
CREATE OR REPLACE FUNCTION public.accept_invite(_invite_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _invite RECORD;
BEGIN
  SELECT * INTO _invite FROM public.team_invites
  WHERE id = _invite_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convite não encontrado';
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
