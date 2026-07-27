-- Create team_invites table
CREATE TABLE public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  invited_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  UNIQUE(company_id, email)
);

-- Enable RLS
ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- Company admins can manage invites
CREATE POLICY "Company admins can manage invites" ON public.team_invites 
  FOR ALL USING (
    (company_id = get_user_company_id(auth.uid())) AND is_company_admin(auth.uid())
  );

-- Anyone can read invites by token (for accepting)
CREATE POLICY "Anyone can read invite by token" ON public.team_invites 
  FOR SELECT USING (true);