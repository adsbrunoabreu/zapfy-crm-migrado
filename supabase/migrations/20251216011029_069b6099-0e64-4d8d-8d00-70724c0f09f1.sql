-- Create tags table
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6366f1',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, name)
);

-- Enable RLS on tags
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

-- RLS policies for tags
CREATE POLICY "Users can view company tags"
ON public.tags FOR SELECT
USING (company_id = get_user_company_id(auth.uid()) OR is_master(auth.uid()));

CREATE POLICY "Company admins can manage tags"
ON public.tags FOR ALL
USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Users can insert tags"
ON public.tags FOR INSERT
WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- Create lead_tags junction table
CREATE TABLE public.lead_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lead_id, tag_id)
);

-- Enable RLS on lead_tags
ALTER TABLE public.lead_tags ENABLE ROW LEVEL SECURITY;

-- RLS policies for lead_tags
CREATE POLICY "Users can view lead tags"
ON public.lead_tags FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.leads l
  WHERE l.id = lead_tags.lead_id
  AND (l.company_id = get_user_company_id(auth.uid()) OR is_master(auth.uid()))
));

CREATE POLICY "Users can manage lead tags"
ON public.lead_tags FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.leads l
  WHERE l.id = lead_tags.lead_id
  AND l.company_id = get_user_company_id(auth.uid())
));

-- Create lead_attachments table
CREATE TABLE public.lead_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on lead_attachments
ALTER TABLE public.lead_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies for lead_attachments
CREATE POLICY "Users can view company attachments"
ON public.lead_attachments FOR SELECT
USING (company_id = get_user_company_id(auth.uid()) OR is_master(auth.uid()));

CREATE POLICY "Users can insert attachments"
ON public.lead_attachments FOR INSERT
WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete own company attachments"
ON public.lead_attachments FOR DELETE
USING (company_id = get_user_company_id(auth.uid()));

-- Create storage bucket for lead attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('lead-attachments', 'lead-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for lead-attachments bucket
CREATE POLICY "Users can upload lead attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lead-attachments' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can view lead attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete lead attachments"
ON storage.objects FOR DELETE
USING (bucket_id = 'lead-attachments' AND auth.uid() IS NOT NULL);