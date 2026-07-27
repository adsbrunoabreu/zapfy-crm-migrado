ALTER TABLE public.attendance_settings
ALTER COLUMN business_hours SET DEFAULT jsonb_build_object(
  'timezone', 'America/Sao_Paulo',
  'days', jsonb_build_object(
    'mon', jsonb_build_object('enabled', true, 'start', '09:00', 'end', '18:00'),
    'tue', jsonb_build_object('enabled', true, 'start', '09:00', 'end', '18:00'),
    'wed', jsonb_build_object('enabled', true, 'start', '09:00', 'end', '18:00'),
    'thu', jsonb_build_object('enabled', true, 'start', '09:00', 'end', '18:00'),
    'fri', jsonb_build_object('enabled', true, 'start', '09:00', 'end', '18:00'),
    'sat', jsonb_build_object('enabled', false, 'start', '09:00', 'end', '13:00'),
    'sun', jsonb_build_object('enabled', false, 'start', '09:00', 'end', '13:00')
  ),
  'off_hours_enabled', false,
  'off_hours_message', 'Olá! No momento estamos fora do horário de atendimento. Retornaremos assim que possível.',
  'on_call_mode', jsonb_build_object('enabled', false, 'start', '18:00', 'end', '22:00')
);

UPDATE public.attendance_settings
SET business_hours = jsonb_set(business_hours, '{off_hours_enabled}', 'false'::jsonb, true)
WHERE NOT (business_hours ? 'off_hours_enabled');

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
$function$;

UPDATE public.attendance_auto_message_queue q
SET status = 'failed',
    processed_at = now(),
    last_error = 'Mensagem fora do horário desativada nas configurações de atendimento'
FROM public.attendance_settings s
WHERE q.company_id = s.company_id
  AND q.message_kind = 'off_hours'
  AND q.status IN ('pending', 'processing')
  AND COALESCE((s.business_hours->>'off_hours_enabled')::BOOLEAN, false) = false;