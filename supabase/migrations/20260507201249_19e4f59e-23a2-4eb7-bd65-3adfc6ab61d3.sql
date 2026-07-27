
CREATE POLICY "Admins can upload member avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      JOIN public.profiles target ON target.id::text = (storage.foldername(name))[1]
      WHERE me.id = auth.uid()
        AND (
          me.role = 'master'
          OR (me.role = 'company_admin' AND me.company_id = target.company_id)
        )
    )
  )
);

CREATE POLICY "Admins can update member avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      JOIN public.profiles target ON target.id::text = (storage.foldername(name))[1]
      WHERE me.id = auth.uid()
        AND (
          me.role = 'master'
          OR (me.role = 'company_admin' AND me.company_id = target.company_id)
        )
    )
  )
);

CREATE POLICY "Admins can delete member avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1
      FROM public.profiles me
      JOIN public.profiles target ON target.id::text = (storage.foldername(name))[1]
      WHERE me.id = auth.uid()
        AND (
          me.role = 'master'
          OR (me.role = 'company_admin' AND me.company_id = target.company_id)
        )
    )
  )
);
