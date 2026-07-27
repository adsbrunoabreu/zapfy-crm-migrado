-- Adiciona logging detalhado de auditoria das mensagens automáticas em system_logs
-- Toda decisão (enfileiramento, skip, motivo) é gravada com source='attendance_auto'

CREATE OR REPLACE FUNCTION public.enqueue_attendance_auto_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id UUID;
  _settings RECORD;
  _is_off BOOLEAN;
  _off_hours_enabled BOOLEAN;
  _welcome_enabled BOOLEAN;
  _show_wait BOOLEAN;
  _has_recent_welcome BOOLEAN;
  _has_recent_off BOOLEAN;
  _kind TEXT;
  _skip_reason TEXT;
BEGIN
  IF NEW.from_me OR COALESCE(NEW.content, '') = '' THEN
    RETURN NEW;
  END IF;

  SELECT company_id INTO _company_id FROM public.conversations WHERE id = NEW.conversation_id;
  IF _company_id IS NULL THEN RETURN NEW; END IF;

  SELECT general, business_hours INTO _settings
  FROM public.attendance_settings WHERE company_id = _company_id;
  IF NOT FOUND THEN
    INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
    VALUES (_company_id, 'attendance_auto', 'debug', 'evaluated',
      'Sem attendance_settings — nenhuma automação avaliada',
      jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'origin', 'trigger:enqueue_attendance_auto_reply'));
    RETURN NEW;
  END IF;

  _is_off := public.is_off_business_hours(_company_id);
  _off_hours_enabled := COALESCE((_settings.business_hours->>'off_hours_enabled')::BOOLEAN, false);
  _welcome_enabled := COALESCE(_settings.general->>'welcome_message','') <> '';
  _show_wait := COALESCE((_settings.general->>'show_wait_time')::BOOLEAN, false);

  IF _is_off AND _off_hours_enabled AND COALESCE(_settings.business_hours->>'off_hours_message','') <> '' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.attendance_auto_messages
      WHERE conversation_id = NEW.conversation_id
        AND message_kind = 'off_hours'
        AND sent_at > now() - interval '6 hours'
    ) INTO _has_recent_off;
    IF _has_recent_off THEN
      INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
      VALUES (_company_id, 'attendance_auto', 'info', 'skipped',
        'off_hours bloqueado: já enviado há menos de 6h',
        jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'kind', 'off_hours', 'reason', 'recent_duplicate', 'origin', 'trigger:enqueue_attendance_auto_reply'));
      RETURN NEW;
    END IF;
    _kind := 'off_hours';
  ELSIF _is_off AND NOT _off_hours_enabled THEN
    INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
    VALUES (_company_id, 'attendance_auto', 'debug', 'skipped',
      'off_hours desativado nas configurações',
      jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'kind', 'off_hours', 'reason', 'off_hours_disabled', 'origin', 'trigger:enqueue_attendance_auto_reply'));
    -- continua para avaliar welcome/wait
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
      _skip_reason := CASE
        WHEN NOT _welcome_enabled AND NOT _show_wait THEN 'no_messages_configured'
        WHEN _has_recent_welcome THEN 'welcome_recent_24h'
        ELSE 'no_match'
      END;
      INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
      VALUES (_company_id, 'attendance_auto', 'debug', 'skipped',
        'Nenhuma mensagem aplicável: ' || _skip_reason,
        jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'reason', _skip_reason, 'is_off', _is_off, 'off_hours_enabled', _off_hours_enabled, 'welcome_enabled', _welcome_enabled, 'show_wait', _show_wait, 'origin', 'trigger:enqueue_attendance_auto_reply'));
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.attendance_auto_message_queue(company_id, conversation_id, message_kind)
  VALUES (_company_id, NEW.conversation_id, _kind);

  INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
  VALUES (_company_id, 'attendance_auto', 'info', 'enqueued',
    'Mensagem ' || _kind || ' enfileirada',
    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'kind', _kind, 'is_off', _is_off, 'off_hours_enabled', _off_hours_enabled, 'origin', 'trigger:enqueue_attendance_auto_reply'));

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
    VALUES (_company_id, 'attendance_auto', 'error', 'trigger_error',
      'Erro no trigger: ' || SQLERRM,
      jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'origin', 'trigger:enqueue_attendance_auto_reply'));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NEW;
END;
$function$;