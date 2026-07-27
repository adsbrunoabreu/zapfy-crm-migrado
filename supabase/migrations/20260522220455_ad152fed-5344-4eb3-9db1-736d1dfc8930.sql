CREATE TABLE public.contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (contact_id, tag_id)
);

CREATE INDEX idx_contact_tags_contact_id ON public.contact_tags(contact_id);
CREATE INDEX idx_contact_tags_tag_id ON public.contact_tags(tag_id);

ALTER TABLE public.contact_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contact tags"
ON public.contact_tags FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contacts c
  WHERE c.id = contact_tags.contact_id
    AND (public.is_master(auth.uid()) OR c.company_id = public.get_user_company_id(auth.uid()))
));

CREATE POLICY "Users can manage contact tags"
ON public.contact_tags FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.contacts c
  WHERE c.id = contact_tags.contact_id
    AND c.company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_active(c.company_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.contacts c
  WHERE c.id = contact_tags.contact_id
    AND c.company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_active(c.company_id)
));