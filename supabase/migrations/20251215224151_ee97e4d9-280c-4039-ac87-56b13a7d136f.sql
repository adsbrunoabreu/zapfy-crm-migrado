-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('master', 'company_admin', 'user');

-- Create enum for plan status
CREATE TYPE public.plan_status AS ENUM ('active', 'trial', 'suspended', 'cancelled');

-- Create enum for lead status
CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost');

-- Create enum for message status
CREATE TYPE public.message_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');

-- Companies table
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  evolution_api_url TEXT,
  evolution_api_token TEXT,
  plan_status plan_status NOT NULL DEFAULT 'trial',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role app_role NOT NULL DEFAULT 'user',
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- User roles table (for RBAC - separate from profiles)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Pipelines table
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Pipeline stages table
CREATE TABLE public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Leads table
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pipeline_id UUID NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  value DECIMAL(15,2),
  status lead_status NOT NULL DEFAULT 'new',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Scheduled messages table
CREATE TABLE public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  status message_status NOT NULL DEFAULT 'pending',
  sent_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Chat messages table (for WhatsApp history)
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  external_id TEXT,
  sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user is master
CREATE OR REPLACE FUNCTION public.is_master(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role = 'master'
  )
$$;

-- Security definer function to get user's company_id
CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = _user_id
$$;

-- Security definer function to check if user is company admin
CREATE OR REPLACE FUNCTION public.is_company_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND role IN ('master', 'company_admin')
  )
$$;

-- RLS Policies for companies
CREATE POLICY "Masters can view all companies"
  ON public.companies FOR SELECT
  USING (public.is_master(auth.uid()));

CREATE POLICY "Masters can insert companies"
  ON public.companies FOR INSERT
  WITH CHECK (public.is_master(auth.uid()));

CREATE POLICY "Masters can update companies"
  ON public.companies FOR UPDATE
  USING (public.is_master(auth.uid()));

CREATE POLICY "Company admins can view own company"
  ON public.companies FOR SELECT
  USING (id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admins can update own company"
  ON public.companies FOR UPDATE
  USING (id = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid()));

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Masters can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_master(auth.uid()));

CREATE POLICY "Company admins can view team profiles"
  ON public.profiles FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Company admins can update team profiles"
  ON public.profiles FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid()));

-- RLS Policies for user_roles
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Masters can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.is_master(auth.uid()));

-- RLS Policies for pipelines
CREATE POLICY "Users can view company pipelines"
  ON public.pipelines FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_master(auth.uid()));

CREATE POLICY "Company admins can manage pipelines"
  ON public.pipelines FOR ALL
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid()));

CREATE POLICY "Masters can manage all pipelines"
  ON public.pipelines FOR ALL
  USING (public.is_master(auth.uid()));

-- RLS Policies for pipeline_stages
CREATE POLICY "Users can view company stages"
  ON public.pipeline_stages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_id
      AND (p.company_id = public.get_user_company_id(auth.uid()) OR public.is_master(auth.uid()))
    )
  );

CREATE POLICY "Company admins can manage stages"
  ON public.pipeline_stages FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_id
      AND p.company_id = public.get_user_company_id(auth.uid())
      AND public.is_company_admin(auth.uid())
    )
  );

-- RLS Policies for leads
CREATE POLICY "Users can view company leads"
  ON public.leads FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_master(auth.uid()));

CREATE POLICY "Users can insert company leads"
  ON public.leads FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update company leads"
  ON public.leads FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Company admins can delete leads"
  ON public.leads FOR DELETE
  USING (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid()));

-- RLS Policies for scheduled_messages
CREATE POLICY "Users can view company scheduled messages"
  ON public.scheduled_messages FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_master(auth.uid()));

CREATE POLICY "Users can insert scheduled messages"
  ON public.scheduled_messages FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own scheduled messages"
  ON public.scheduled_messages FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()));

-- RLS Policies for chat_messages
CREATE POLICY "Users can view company chat messages"
  ON public.chat_messages FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_master(auth.uid()));

CREATE POLICY "Users can insert chat messages"
  ON public.chat_messages FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.email),
    COALESCE((new.raw_user_meta_data ->> 'role')::app_role, 'user')
  );
  RETURN new;
END;
$$;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for leads and chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

-- Create indexes for better performance
CREATE INDEX idx_profiles_company_id ON public.profiles(company_id);
CREATE INDEX idx_pipelines_company_id ON public.pipelines(company_id);
CREATE INDEX idx_leads_company_id ON public.leads(company_id);
CREATE INDEX idx_leads_pipeline_id ON public.leads(pipeline_id);
CREATE INDEX idx_leads_stage_id ON public.leads(stage_id);
CREATE INDEX idx_scheduled_messages_company_id ON public.scheduled_messages(company_id);
CREATE INDEX idx_chat_messages_company_id ON public.chat_messages(company_id);
CREATE INDEX idx_chat_messages_lead_id ON public.chat_messages(lead_id);