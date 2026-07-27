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
  _welcome_flag_explicit BOOLEAN;
  _welcome_message_set BOOLEAN;
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
    RETURN NEW;
  END IF;

  _is_off := public.is_off_business_hours(_company_id);
  _off_hours_enabled := COALESCE((_settings.business_hours->>'off_hours_enabled')::BOOLEAN, false);

  -- Flag explícita welcome_enabled tem prioridade; se ausente, fallback para texto não vazio
  _welcome_message_set := COALESCE(_settings.general->>'welcome_message','') <> '';
  _welcome_flag_explicit := (_settings.general ? 'welcome_enabled');
  IF _welcome_flag_explicit THEN
    _welcome_enabled := COALESCE((_settings.general->>'welcome_enabled')::BOOLEAN, false) AND _welcome_message_set;
  ELSE
    _welcome_enabled := _welcome_message_set;
  END IF;

  _show_wait := COALESCE((_settings.general->>'show_wait_time')::BOOLEAN, false);

  -- PRÉ-FILTRO: se nada está habilitado, sair sem enfileirar
  IF NOT _welcome_enabled
     AND NOT _show_wait
     AND NOT (_is_off AND _off_hours_enabled AND COALESCE(_settings.business_hours->>'off_hours_message','') <> '')
  THEN
    RETURN NEW;
  END IF;

  IF _is_off AND _off_hours_enabled AND COALESCE(_settings.business_hours->>'off_hours_message','') <> '' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.attendance_auto_messages
      WHERE conversation_id = NEW.conversation_id
        AND message_kind = 'off_hours'
        AND sent_at > now() - interval '6 hours'
    ) INTO _has_recent_off;
    IF _has_recent_off THEN
      RETURN NEW;
    END IF;
    _kind := 'off_hours';
  ELSIF _is_off AND NOT _off_hours_enabled THEN
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
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO public.attendance_auto_message_queue(company_id, conversation_id, message_kind)
  VALUES (_company_id, NEW.conversation_id, _kind);

  INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
  VALUES (_company_id, 'attendance_auto', 'info', 'enqueued',
    'Mensagem ' || _kind || ' enfileirada',
    jsonb_build_object('conversation_id', NEW.conversation_id, 'message_id', NEW.id, 'kind', _kind, 'is_off', _is_off, 'off_hours_enabled', _off_hours_enabled, 'welcome_enabled', _welcome_enabled, 'show_wait', _show_wait, 'origin', 'trigger:enqueue_attendance_auto_reply'));

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