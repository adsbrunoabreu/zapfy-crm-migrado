
ALTER TABLE public.ai_global_config REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_global_config;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
