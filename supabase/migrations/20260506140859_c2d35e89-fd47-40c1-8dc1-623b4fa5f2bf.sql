
-- ============================================================================
-- 1) DROP legado
-- ============================================================================
DROP TRIGGER IF EXISTS trg_webhook_chat_message ON public.chat_messages;
DROP TRIGGER IF EXISTS trg_webhook_lead_created ON public.leads;
DROP TRIGGER IF EXISTS trg_webhook_lead_updated ON public.leads;
DROP TRIGGER IF EXISTS trg_webhook_lead_stage_changed ON public.leads;
DROP TRIGGER IF EXISTS trg_webhook_lead_transferred ON public.leads;

DROP FUNCTION IF EXISTS public.notify_webhook_event() CASCADE;
DROP FUNCTION IF EXISTS public.notify_webhook_message() CASCADE;

DROP TABLE IF EXISTS public.webhook_logs CASCADE;
DROP TABLE IF EXISTS public.webhooks CASCADE;

-- ============================================================================
-- 2) Tabela webhooks
-- ============================================================================
CREATE TABLE public.webhooks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  secret        TEXT NOT NULL,
  events        TEXT[] NOT NULL DEFAULT '{}',
  instance_ids  UUID[] NOT NULL DEFAULT '{}',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_company        ON public.webhooks(company_id);
CREATE INDEX idx_webhooks_active         ON public.webhooks(company_id, is_active);
CREATE INDEX idx_webhooks_instance_ids   ON public.webhooks USING GIN(instance_ids);
CREATE INDEX idx_webhooks_events         ON public.webhooks USING GIN(events);

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view own webhooks" ON public.webhooks
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Admins insert own webhooks" ON public.webhooks
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid())
              AND is_company_admin(auth.uid())
              AND is_company_active(company_id));

CREATE POLICY "Admins update own webhooks" ON public.webhooks
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Admins delete own webhooks" ON public.webhooks
  FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE TRIGGER trg_webhooks_updated_at
  BEFORE UPDATE ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3) Tabela webhook_events_queue
-- ============================================================================
CREATE TABLE public.webhook_events_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  event         TEXT NOT NULL,
  payload       JSONB NOT NULL,
  picked_at     TIMESTAMPTZ,
  processed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wh_queue_pending ON public.webhook_events_queue(created_at)
  WHERE processed_at IS NULL;
CREATE INDEX idx_wh_queue_company ON public.webhook_events_queue(company_id, created_at DESC);

ALTER TABLE public.webhook_events_queue ENABLE ROW LEVEL SECURITY;
-- Sem políticas: tabela acessada apenas por service_role.

-- ============================================================================
-- 4) Tabela webhook_deliveries
-- ============================================================================
CREATE TABLE public.webhook_deliveries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id            UUID NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  company_id            UUID NOT NULL,
  event                 TEXT NOT NULL,
  correlation_id        UUID NOT NULL,
  payload               JSONB NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending',  -- pending|success|failed|dead
  attempt               INT NOT NULL DEFAULT 0,
  max_attempts          INT NOT NULL DEFAULT 6,
  next_attempt_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_request_headers  JSONB,
  last_response_status  INT,
  last_response_body    TEXT,
  last_error            TEXT,
  duration_ms           INT,
  delivered_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deliveries_pending      ON public.webhook_deliveries(next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX idx_deliveries_company_date ON public.webhook_deliveries(company_id, created_at DESC);
CREATE INDEX idx_deliveries_webhook_date ON public.webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX idx_deliveries_correlation  ON public.webhook_deliveries(correlation_id);
CREATE INDEX idx_deliveries_status       ON public.webhook_deliveries(company_id, status, created_at DESC);

ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view own deliveries" ON public.webhook_deliveries
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE TRIGGER trg_deliveries_updated_at
  BEFORE UPDATE ON public.webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 5) Função enqueue_webhook_event — usada pelos triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enqueue_webhook_event(
  _company_id UUID,
  _event      TEXT,
  _payload    JSONB
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _company_id IS NULL THEN RETURN; END IF;

  -- Otimização: enfileira apenas se houver webhook ativo cobrindo o evento
  IF NOT EXISTS (
    SELECT 1 FROM public.webhooks
     WHERE company_id = _company_id
       AND is_active = true
       AND (events = '{}' OR _event = ANY(events) OR '*' = ANY(events))
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.webhook_events_queue(company_id, event, payload)
  VALUES (_company_id, _event, _payload);
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'enqueue_webhook_event failed: % %', SQLERRM, SQLSTATE;
END;
$$;

-- ============================================================================
-- 6) Triggers
-- ============================================================================
-- Mensagens
CREATE OR REPLACE FUNCTION public.trg_fn_webhook_chat_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _event TEXT;
BEGIN
  _event := CASE WHEN NEW.from_me THEN 'message.sent' ELSE 'message.received' END;
  PERFORM public.enqueue_webhook_event(
    NEW.company_id,
    _event,
    jsonb_build_object(
      'message_id',           NEW.id,
      'conversation_id',      NEW.conversation_id,
      'remote_jid',           NEW.remote_jid,
      'message_type',         NEW.message_type,
      'content',              NEW.content,
      'from_me',              NEW.from_me,
      'status',               NEW.status,
      'media_storage_path',   NEW.media_storage_path,
      'media_mimetype',       NEW.media_mimetype,
      'file_name',            NEW.file_name,
      'duration',             NEW.duration,
      'sender_name',          NEW.sender_name,
      'timestamp',            NEW.timestamp,
      'provider_message_id',  NEW.provider_message_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'trg_fn_webhook_chat_message: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_chat_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_webhook_chat_message();

-- Lead criado
CREATE OR REPLACE FUNCTION public.trg_fn_webhook_lead_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_webhook_event(
    NEW.company_id, 'lead.created', jsonb_build_object('lead_id', NEW.id)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'trg_fn_webhook_lead_created: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_lead_created
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_webhook_lead_created();

-- Lead movido de etapa
CREATE OR REPLACE FUNCTION public.trg_fn_webhook_lead_stage_changed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_webhook_event(
    NEW.company_id, 'lead.stage_changed',
    jsonb_build_object(
      'lead_id',       NEW.id,
      'from_stage_id', OLD.stage_id,
      'to_stage_id',   NEW.stage_id,
      'pipeline_id',   NEW.pipeline_id
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'trg_fn_webhook_lead_stage_changed: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_lead_stage_changed
  AFTER UPDATE OF stage_id ON public.leads
  FOR EACH ROW WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
  EXECUTE FUNCTION public.trg_fn_webhook_lead_stage_changed();

-- Lead transferido
CREATE OR REPLACE FUNCTION public.trg_fn_webhook_lead_transferred()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enqueue_webhook_event(
    NEW.company_id, 'lead.transferred',
    jsonb_build_object(
      'lead_id',          NEW.id,
      'from_assigned_to', OLD.assigned_to,
      'to_assigned_to',   NEW.assigned_to
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'trg_fn_webhook_lead_transferred: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_lead_transferred
  AFTER UPDATE OF assigned_to ON public.leads
  FOR EACH ROW WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.trg_fn_webhook_lead_transferred();

-- Lead atualizado (genérico, exclui mudanças que já têm evento dedicado)
CREATE OR REPLACE FUNCTION public.trg_fn_webhook_lead_updated()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _changed JSONB := '{}'::jsonb;
BEGIN
  -- Se só mudou stage_id ou assigned_to, ignora (já tem trigger específico)
  IF (OLD.stage_id    IS DISTINCT FROM NEW.stage_id    AND
      OLD.assigned_to IS NOT DISTINCT FROM NEW.assigned_to AND
      OLD.name        IS NOT DISTINCT FROM NEW.name AND
      OLD.phone       IS NOT DISTINCT FROM NEW.phone AND
      OLD.email       IS NOT DISTINCT FROM NEW.email AND
      OLD.value       IS NOT DISTINCT FROM NEW.value AND
      OLD.status      IS NOT DISTINCT FROM NEW.status AND
      OLD.notes       IS NOT DISTINCT FROM NEW.notes) THEN
    RETURN NEW;
  END IF;

  IF OLD.name        IS DISTINCT FROM NEW.name        THEN _changed := _changed || jsonb_build_object('name',        jsonb_build_object('old', OLD.name,        'new', NEW.name));        END IF;
  IF OLD.phone       IS DISTINCT FROM NEW.phone       THEN _changed := _changed || jsonb_build_object('phone',       jsonb_build_object('old', OLD.phone,       'new', NEW.phone));       END IF;
  IF OLD.email       IS DISTINCT FROM NEW.email       THEN _changed := _changed || jsonb_build_object('email',       jsonb_build_object('old', OLD.email,       'new', NEW.email));       END IF;
  IF OLD.value       IS DISTINCT FROM NEW.value       THEN _changed := _changed || jsonb_build_object('value',       jsonb_build_object('old', OLD.value,       'new', NEW.value));       END IF;
  IF OLD.status      IS DISTINCT FROM NEW.status      THEN _changed := _changed || jsonb_build_object('status',      jsonb_build_object('old', OLD.status,      'new', NEW.status));      END IF;
  IF OLD.notes       IS DISTINCT FROM NEW.notes       THEN _changed := _changed || jsonb_build_object('notes',       jsonb_build_object('old', OLD.notes,       'new', NEW.notes));       END IF;

  IF _changed = '{}'::jsonb THEN RETURN NEW; END IF;

  PERFORM public.enqueue_webhook_event(
    NEW.company_id, 'lead.updated',
    jsonb_build_object('lead_id', NEW.id, 'changes', _changed)
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'trg_fn_webhook_lead_updated: % %', SQLERRM, SQLSTATE;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_webhook_lead_updated
  AFTER UPDATE ON public.leads
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION public.trg_fn_webhook_lead_updated();
