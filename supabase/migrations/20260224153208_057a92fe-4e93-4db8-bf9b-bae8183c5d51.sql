
-- Create user_whatsapp_instances junction table
CREATE TABLE public.user_whatsapp_instances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  whatsapp_instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint: one active binding per user
CREATE UNIQUE INDEX idx_user_whatsapp_instances_active 
  ON public.user_whatsapp_instances(user_id, company_id) 
  WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.user_whatsapp_instances ENABLE ROW LEVEL SECURITY;

-- Users can view their own bindings
CREATE POLICY "Users can view own instance binding"
  ON public.user_whatsapp_instances
  FOR SELECT
  USING (user_id = auth.uid() OR (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())));

-- Users can insert their own binding
CREATE POLICY "Users can insert own instance binding"
  ON public.user_whatsapp_instances
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND company_id = get_user_company_id(auth.uid())
  );

-- Users can update their own binding, admins can update any in company
CREATE POLICY "Users can update own instance binding"
  ON public.user_whatsapp_instances
  FOR UPDATE
  USING (
    (user_id = auth.uid()) OR 
    (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()))
  );

-- Users can delete their own binding, admins can delete any in company
CREATE POLICY "Users can delete own instance binding"
  ON public.user_whatsapp_instances
  FOR DELETE
  USING (
    (user_id = auth.uid()) OR 
    (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()))
  );
