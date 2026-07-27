DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='attendance_tickets') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_tickets';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='attendance_ticket_events') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_ticket_events';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='attendance_ticket_ratings') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_ticket_ratings';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='lead_history') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_history';
  END IF;
END $$;