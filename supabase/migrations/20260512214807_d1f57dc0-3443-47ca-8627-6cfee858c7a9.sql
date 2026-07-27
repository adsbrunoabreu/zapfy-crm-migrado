ALTER PUBLICATION supabase_realtime ADD TABLE public.instance_health;
ALTER PUBLICATION supabase_realtime ADD TABLE public.instance_events;
ALTER TABLE public.instance_health REPLICA IDENTITY FULL;
ALTER TABLE public.instance_events REPLICA IDENTITY FULL;