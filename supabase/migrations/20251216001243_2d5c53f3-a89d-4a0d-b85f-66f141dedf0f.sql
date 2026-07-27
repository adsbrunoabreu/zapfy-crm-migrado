-- Create storage bucket for chat media
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read from chat-media bucket (public)
CREATE POLICY "Public read access for chat media"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');

-- Allow authenticated users to upload to their company folder
CREATE POLICY "Users can upload chat media"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'chat-media'
);

-- Allow service role to manage all files (for webhook)
CREATE POLICY "Service role can manage chat media"
ON storage.objects FOR ALL
USING (bucket_id = 'chat-media');