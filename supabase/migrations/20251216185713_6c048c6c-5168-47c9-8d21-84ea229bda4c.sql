-- Update RLS policy for leads: regular users see only their assigned leads
DROP POLICY IF EXISTS "Users can view company leads" ON public.leads;
CREATE POLICY "Users can view company leads" ON public.leads
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid()) AND (
      is_company_admin(auth.uid()) OR 
      assigned_to = auth.uid()
    )
  );

-- Create lead distribution settings table
CREATE TABLE public.lead_distribution_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE NOT NULL,
  enabled boolean DEFAULT false,
  distribution_mode text DEFAULT 'round_robin' CHECK (distribution_mode IN ('round_robin', 'random')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create lead distribution users table
CREATE TABLE public.lead_distribution_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  is_active boolean DEFAULT true,
  assigned_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Enable RLS
ALTER TABLE public.lead_distribution_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_distribution_users ENABLE ROW LEVEL SECURITY;

-- RLS policies for lead_distribution_settings
CREATE POLICY "Company admins can manage distribution settings"
  ON public.lead_distribution_settings FOR ALL
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Users can view distribution settings"
  ON public.lead_distribution_settings FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

-- RLS policies for lead_distribution_users
CREATE POLICY "Company admins can manage distribution users"
  ON public.lead_distribution_users FOR ALL
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Users can view distribution users"
  ON public.lead_distribution_users FOR SELECT
  USING (company_id = get_user_company_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_lead_distribution_settings_updated_at
  BEFORE UPDATE ON public.lead_distribution_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();