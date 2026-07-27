
-- Make chat-media bucket private
UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

-- Make scheduled-media bucket private
UPDATE storage.buckets SET public = false WHERE id = 'scheduled-media';

-- Drop public read policies
DROP POLICY IF EXISTS "Public read access for chat media" ON storage.objects;
DROP POLICY IF EXISTS "Scheduled media is publicly accessible" ON storage.objects;

-- Add company-scoped read policy for chat-media
CREATE POLICY "Company members can view chat media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'chat-media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- Add company-scoped read policy for scheduled-media
CREATE POLICY "Company members can view scheduled media"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'scheduled-media'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] IN (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);
