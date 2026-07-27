
-- Create company-logos bucket (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read
CREATE POLICY "Company logos are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'company-logos');

-- Master can manage all
CREATE POLICY "Master manages company logos"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'company-logos' AND is_master(auth.uid()))
WITH CHECK (bucket_id = 'company-logos' AND is_master(auth.uid()));

-- Company admins can upload/update/delete logos for their own company (path: {company_id}/...)
CREATE POLICY "Company admins upload own logo"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND is_company_admin(auth.uid())
  AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

CREATE POLICY "Company admins update own logo"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND is_company_admin(auth.uid())
  AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);

CREATE POLICY "Company admins delete own logo"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND is_company_admin(auth.uid())
  AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
);
