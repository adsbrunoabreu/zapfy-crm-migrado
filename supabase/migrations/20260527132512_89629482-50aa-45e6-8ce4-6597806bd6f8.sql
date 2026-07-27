DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='financial_entries') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_entries;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='financial_categories') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.financial_categories;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='appointments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
  END IF;
END $$;
ALTER TABLE public.financial_entries REPLICA IDENTITY FULL;
ALTER TABLE public.financial_categories REPLICA IDENTITY FULL;