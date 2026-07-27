DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tgname, c.relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND (
        t.tgname ILIKE '%auto_reply%'
        OR t.tgname ILIKE '%lead_seq%'
        OR t.tgname ILIKE '%seq_cancel%'
        OR t.tgname ILIKE '%webhook%'
        OR t.tgname ILIKE '%automacao%'
        OR t.tgname ILIKE '%sequence%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', r.relname, r.tgname);
    RAISE NOTICE 'Disabled trigger % on %', r.tgname, r.relname;
  END LOOP;
END $$;