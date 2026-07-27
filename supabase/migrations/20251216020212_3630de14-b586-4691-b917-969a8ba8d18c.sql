-- Add media columns to scheduled_messages
ALTER TABLE scheduled_messages 
ADD COLUMN message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'video', 'document', 'audio')),
ADD COLUMN media_url TEXT,
ADD COLUMN media_caption TEXT,
ADD COLUMN media_filename TEXT,
ADD COLUMN media_mimetype TEXT;

-- Create storage bucket for scheduled media
INSERT INTO storage.buckets (id, name, public) 
VALUES ('scheduled-media', 'scheduled-media', true)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy for upload
CREATE POLICY "Users can upload scheduled media" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'scheduled-media');

-- RLS Policy for view
CREATE POLICY "Scheduled media is publicly accessible" 
ON storage.objects FOR SELECT 
TO public 
USING (bucket_id = 'scheduled-media');

-- RLS Policy for delete
CREATE POLICY "Users can delete own scheduled media" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id = 'scheduled-media');