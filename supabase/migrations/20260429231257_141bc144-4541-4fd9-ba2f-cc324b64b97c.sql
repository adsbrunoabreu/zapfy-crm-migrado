-- Fila de auto-replies para serem processadas por cron/edge
CREATE TABLE IF NOT EXISTS public.attendance_auto_message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  message_kind TEXT NOT NULL CHECK (message_kind IN ('off_hours','welcome','wait_time')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auto_msg_queue_pending
  ON public.attendance_auto_message_queue(status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.attendance_auto_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view auto message queue"
  ON public.attendance_auto_message_queue FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

-- Trigger: enfileira mensagem automática quando cliente envia
CREATE OR REPLACE FUNCTION public.enqueue_attendance_auto_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _company_id UUID;
  _settings RECORD;
  _is_off BOOLEAN;
  _welcome_enabled BOOLEAN;
  _show_wait BOOLEAN;
  _has_recent_welcome BOOLEAN;
  _has_recent_off BOOLEAN;
  _kind TEXT;
BEGIN
  IF NEW.from_me OR COALESCE(NEW.content, '') = '' THEN
    RETURN NEW;
  END IF;

  SELECT company_id INTO _company_id FROM public.conversations WHERE id = NEW.conversation_id;
  IF _company_id IS NULL THEN RETURN NEW; END IF;

  SELECT general, business_hours INTO _settings
  FROM public.attendance_settings WHERE company_id = _company_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  _is_off := public.is_off_business_hours(_company_id);
  _welcome_enabled := COALESCE(_settings.general->>'welcome_message','') <> '';
  _show_wait := COALESCE((_settings.general->>'show_wait_time')::BOOLEAN, false);

  IF _is_off AND COALESCE(_settings.business_hours->>'off_hours_message','') <> '' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.attendance_auto_messages
      WHERE conversation_id = NEW.conversation_id
        AND message_kind = 'off_hours'
        AND sent_at > now() - interval '6 hours'
    ) INTO _has_recent_off;
    IF _has_recent_off THEN RETURN NEW; END IF;
    _kind := 'off_hours';
  ELSE
    SELECT EXISTS(
      SELECT 1 FROM public.attendance_auto_messages
      WHERE conversation_id = NEW.conversation_id
        AND message_kind = 'welcome'
        AND sent_at > now() - interval '24 hours'
    ) INTO _has_recent_welcome;

    IF _welcome_enabled AND NOT _has_recent_welcome THEN
      _kind := 'welcome';
    ELSIF _show_wait THEN
      _kind := 'wait_time';
    ELSE
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.attendance_auto_message_queue(company_id, conversation_id, message_kind)
  VALUES (_company_id, NEW.conversation_id, _kind);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enqueue_auto_reply ON public.chat_messages;
CREATE TRIGGER trg_enqueue_auto_reply
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_attendance_auto_reply();