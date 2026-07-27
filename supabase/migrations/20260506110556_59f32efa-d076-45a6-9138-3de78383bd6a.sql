-- 1. whatsapp_instances: adicionar colunas multi-provider
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_preferred BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT,
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_instances_provider_check') THEN
    ALTER TABLE public.whatsapp_instances
      ADD CONSTRAINT whatsapp_instances_provider_check CHECK (provider IN ('evolution','cloud_api'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_instances_company_provider_phone
  ON public.whatsapp_instances (company_id, provider, phone_number)
  WHERE phone_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_provider
  ON public.whatsapp_instances(company_id, provider, is_active);

-- 2. conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_provider
  ON public.conversations(company_id, provider, instance_id);

-- 3. chat_messages
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'evolution',
  ADD COLUMN IF NOT EXISTS provider_message_id TEXT,
  ADD COLUMN IF NOT EXISTS interactive_payload JSONB,
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS webhook_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_raw_payload JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_provider_message_unique
  ON public.chat_messages(provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- 4. message_sync_log
CREATE TABLE IF NOT EXISTS public.message_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  provider TEXT,
  provider_event_id TEXT,
  message_content TEXT,
  status TEXT CHECK (status IN ('success','error','warning')),
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_log_company
  ON public.message_sync_log(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_conversation
  ON public.message_sync_log(conversation_id, created_at DESC);

-- 5. RLS message_sync_log
ALTER TABLE public.message_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Masters can manage all message_sync_log" ON public.message_sync_log;
CREATE POLICY "Masters can manage all message_sync_log" ON public.message_sync_log
  FOR ALL USING (public.is_master(auth.uid())) WITH CHECK (public.is_master(auth.uid()));

DROP POLICY IF EXISTS "Users can view company message_sync_log" ON public.message_sync_log;
CREATE POLICY "Users can view company message_sync_log" ON public.message_sync_log
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "Service can insert message_sync_log" ON public.message_sync_log;
CREATE POLICY "Service can insert message_sync_log" ON public.message_sync_log
  FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));