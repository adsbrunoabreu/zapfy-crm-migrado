
ALTER TABLE public.lead_procedures REPLICA IDENTITY FULL;
ALTER TABLE public.medical_procedures REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'lead_procedures'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_procedures;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'medical_procedures'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.medical_procedures;
  END IF;
END $$;
