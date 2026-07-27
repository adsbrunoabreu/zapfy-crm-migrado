ALTER TABLE public.lead_tags REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'lead_tags'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_tags;
  END IF;
END $$;