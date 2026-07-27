-- ─── Extensions ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── Tabela: webhooks ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhooks_company ON public.webhooks(company_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON public.webhooks(company_id, is_active);

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage all webhooks"
ON public.webhooks FOR ALL TO authenticated
USING (public.is_master(auth.uid()))
WITH CHECK (public.is_master(auth.uid()));

CREATE POLICY "Company admins view own webhooks"
ON public.webhooks FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid())
       AND public.is_company_admin(auth.uid()));

CREATE POLICY "Company admins insert own webhooks"
ON public.webhooks FOR INSERT TO authenticated
WITH CHECK (company_id = public.get_user_company_id(auth.uid())
            AND public.is_company_admin(auth.uid())
            AND public.is_company_active(company_id));

CREATE POLICY "Company admins update own webhooks"
ON public.webhooks FOR UPDATE TO authenticated
USING (company_id = public.get_user_company_id(auth.uid())
       AND public.is_company_admin(auth.uid())
       AND public.is_company_active(company_id))
WITH CHECK (company_id = public.get_user_company_id(auth.uid())
            AND public.is_company_admin(auth.uid())
            AND public.is_company_active(company_id));

CREATE POLICY "Company admins delete own webhooks"
ON public.webhooks FOR DELETE TO authenticated
USING (company_id = public.get_user_company_id(auth.uid())
       AND public.is_company_admin(auth.uid()));

CREATE TRIGGER trg_webhooks_updated_at
BEFORE UPDATE ON public.webhooks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Tabela: webhook_logs ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  event TEXT NOT NULL,
  payload JSONB,
  response_status INT,
  response_body TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_webhook ON public.webhook_logs(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_company ON public.webhook_logs(company_id, created_at DESC);

ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters view all webhook logs"
ON public.webhook_logs FOR SELECT TO authenticated
USING (public.is_master(auth.uid()));

CREATE POLICY "Company admins view own webhook logs"
ON public.webhook_logs FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid())
       AND public.is_company_admin(auth.uid()));

-- ─── Função de dispatch ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_webhook_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _event TEXT := TG_ARGV[0];
  _company_id UUID;
  _record JSONB;
  _old_record JSONB;
  _project_url TEXT := 'https://bupzemhjqzjlbsgmcdti.supabase.co';
  _service_key TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _record := to_jsonb(OLD);
    _old_record := to_jsonb(OLD);
  ELSIF TG_OP = 'UPDATE' THEN
    _record := to_jsonb(NEW);
    _old_record := to_jsonb(OLD);
  ELSE
    _record := to_jsonb(NEW);
    _old_record := NULL;
  END IF;

  _company_id := COALESCE(
    (_record->>'company_id')::UUID,
    (_old_record->>'company_id')::UUID
  );

  IF _company_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Verifica se há webhook ativo para este evento (otimização: evita HTTP desnecessário)
  IF NOT EXISTS (
    SELECT 1 FROM public.webhooks
    WHERE company_id = _company_id
      AND is_active = true
      AND (events = '{}' OR _event = ANY(events) OR '*' = ANY(events))
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Service role key vem do vault/secret do projeto
  BEGIN
    SELECT decrypted_secret INTO _service_key
    FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _service_key := NULL;
  END;

  PERFORM net.http_post(
    url := _project_url || '/functions/v1/dispatch-webhooks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'event', _event,
      'table', TG_TABLE_NAME,
      'operation', TG_OP,
      'record', _record,
      'old_record', _old_record,
      'timestamp', now()
    )
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Nunca quebrar a transação principal por causa de webhook
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ─── Triggers em leads ──────────────────────────────────────
DROP TRIGGER IF EXISTS trg_webhook_lead_created ON public.leads;
CREATE TRIGGER trg_webhook_lead_created
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.notify_webhook_event('lead.created');

DROP TRIGGER IF EXISTS trg_webhook_lead_updated ON public.leads;
CREATE TRIGGER trg_webhook_lead_updated
AFTER UPDATE ON public.leads
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.notify_webhook_event('lead.updated');

DROP TRIGGER IF EXISTS trg_webhook_lead_stage_changed ON public.leads;
CREATE TRIGGER trg_webhook_lead_stage_changed
AFTER UPDATE OF stage_id ON public.leads
FOR EACH ROW
WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
EXECUTE FUNCTION public.notify_webhook_event('lead.stage_changed');

DROP TRIGGER IF EXISTS trg_webhook_lead_transferred ON public.leads;
CREATE TRIGGER trg_webhook_lead_transferred
AFTER UPDATE OF assigned_to ON public.leads
FOR EACH ROW
WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
EXECUTE FUNCTION public.notify_webhook_event('lead.transferred');

-- ─── Triggers em chat_messages ──────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_webhook_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _event TEXT;
  _project_url TEXT := 'https://bupzemhjqzjlbsgmcdti.supabase.co';
BEGIN
  _event := CASE WHEN NEW.from_me THEN 'message.sent' ELSE 'message.received' END;

  IF NOT EXISTS (
    SELECT 1 FROM public.webhooks
    WHERE company_id = NEW.company_id
      AND is_active = true
      AND (events = '{}' OR _event = ANY(events) OR '*' = ANY(events))
  ) THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := _project_url || '/functions/v1/dispatch-webhooks',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object(
      'event', _event,
      'table', 'chat_messages',
      'operation', 'INSERT',
      'record', to_jsonb(NEW),
      'old_record', NULL,
      'timestamp', now()
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_webhook_chat_message ON public.chat_messages;
CREATE TRIGGER trg_webhook_chat_message
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_webhook_message();
