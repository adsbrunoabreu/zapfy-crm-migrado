-- Fase 2: drop dos 5 triggers antigos (agora cobertos pela fila assíncrona)
DROP TRIGGER IF EXISTS trg_webhook_chat_message ON public.chat_messages;
DROP TRIGGER IF EXISTS trg_extract_link_preview ON public.chat_messages;
DROP TRIGGER IF EXISTS trg_invoke_ai_agent ON public.chat_messages;
DROP TRIGGER IF EXISTS trg_set_lead_responded_at ON public.chat_messages;
DROP TRIGGER IF EXISTS trg_capture_rating_response ON public.chat_messages;

-- Garantir extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remover schedule anterior se existir
DO $$
BEGIN
  PERFORM cron.unschedule('chat-messages-side-effects-worker-30s');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Agendar worker a cada 30 segundos (2 invocações por minuto)
SELECT cron.schedule(
  'chat-messages-side-effects-worker-30s-a',
  '* * * * *',
  $$
  SELECT net.http_post(
    url:='https://bupzemhjqzjlbsgmcdti.supabase.co/functions/v1/chat-messages-side-effects-worker',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cHplbWhqcXpqbGJzZ21jZHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4Mjc5ODIsImV4cCI6MjA4MTQwMzk4Mn0.S0ZiJm0I2PsT8u-ZXczcIcbhxnO1OLfL47spJp7wxgg","x-internal-call":"true"}'::jsonb,
    body:='{"source":"cron"}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'chat-messages-side-effects-worker-30s-b',
  '* * * * *',
  $$
  SELECT pg_sleep(30);
  SELECT net.http_post(
    url:='https://bupzemhjqzjlbsgmcdti.supabase.co/functions/v1/chat-messages-side-effects-worker',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1cHplbWhqcXpqbGJzZ21jZHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4Mjc5ODIsImV4cCI6MjA4MTQwMzk4Mn0.S0ZiJm0I2PsT8u-ZXczcIcbhxnO1OLfL47spJp7wxgg","x-internal-call":"true"}'::jsonb,
    body:='{"source":"cron"}'::jsonb
  );
  $$
);