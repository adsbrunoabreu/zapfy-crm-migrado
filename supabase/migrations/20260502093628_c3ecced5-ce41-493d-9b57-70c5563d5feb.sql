-- Trigger: ao atualizar attendance_settings, cancelar fila pendente das automações desativadas
CREATE OR REPLACE FUNCTION public.cancel_disabled_attendance_queue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _was_off_enabled BOOLEAN;
  _is_off_enabled BOOLEAN;
  _was_welcome BOOLEAN;
  _is_welcome BOOLEAN;
  _was_wait BOOLEAN;
  _is_wait BOOLEAN;
  _cancelled INT;
BEGIN
  _was_off_enabled := COALESCE((OLD.business_hours->>'off_hours_enabled')::BOOLEAN, false);
  _is_off_enabled  := COALESCE((NEW.business_hours->>'off_hours_enabled')::BOOLEAN, false);

  _was_welcome := COALESCE(OLD.general->>'welcome_message','') <> '';
  _is_welcome  := COALESCE(NEW.general->>'welcome_message','') <> '';

  _was_wait := COALESCE((OLD.general->>'show_wait_time')::BOOLEAN, false);
  _is_wait  := COALESCE((NEW.general->>'show_wait_time')::BOOLEAN, false);

  -- off_hours desativado
  IF _was_off_enabled AND NOT _is_off_enabled THEN
    UPDATE public.attendance_auto_message_queue
       SET status = 'failed',
           processed_at = now(),
           last_error = 'Cancelado: automação fora do horário foi desativada nas configurações'
     WHERE company_id = NEW.company_id
       AND message_kind = 'off_hours'
       AND status IN ('pending','processing');
    GET DIAGNOSTICS _cancelled = ROW_COUNT;
    IF _cancelled > 0 THEN
      INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
      VALUES (NEW.company_id, 'attendance_auto', 'warn', 'auto_cancel',
        format('%s mensagens off_hours canceladas (automação desativada)', _cancelled),
        jsonb_build_object('kind','off_hours','cancelled', _cancelled,'origin','trigger:cancel_disabled_attendance_queue'));
    END IF;
  END IF;

  -- welcome desativado (mensagem vazia)
  IF _was_welcome AND NOT _is_welcome THEN
    UPDATE public.attendance_auto_message_queue
       SET status = 'failed',
           processed_at = now(),
           last_error = 'Cancelado: mensagem de boas-vindas foi removida nas configurações'
     WHERE company_id = NEW.company_id
       AND message_kind = 'welcome'
       AND status IN ('pending','processing');
    GET DIAGNOSTICS _cancelled = ROW_COUNT;
    IF _cancelled > 0 THEN
      INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
      VALUES (NEW.company_id, 'attendance_auto', 'warn', 'auto_cancel',
        format('%s mensagens welcome canceladas (mensagem removida)', _cancelled),
        jsonb_build_object('kind','welcome','cancelled', _cancelled,'origin','trigger:cancel_disabled_attendance_queue'));
    END IF;
  END IF;

  -- wait_time desativado
  IF _was_wait AND NOT _is_wait THEN
    UPDATE public.attendance_auto_message_queue
       SET status = 'failed',
           processed_at = now(),
           last_error = 'Cancelado: aviso de tempo de espera foi desativado nas configurações'
     WHERE company_id = NEW.company_id
       AND message_kind = 'wait_time'
       AND status IN ('pending','processing');
    GET DIAGNOSTICS _cancelled = ROW_COUNT;
    IF _cancelled > 0 THEN
      INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
      VALUES (NEW.company_id, 'attendance_auto', 'warn', 'auto_cancel',
        format('%s mensagens wait_time canceladas (automação desativada)', _cancelled),
        jsonb_build_object('kind','wait_time','cancelled', _cancelled,'origin','trigger:cancel_disabled_attendance_queue'));
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_cancel_disabled_attendance_queue ON public.attendance_settings;
CREATE TRIGGER trg_cancel_disabled_attendance_queue
AFTER UPDATE ON public.attendance_settings
FOR EACH ROW
WHEN (OLD.general IS DISTINCT FROM NEW.general OR OLD.business_hours IS DISTINCT FROM NEW.business_hours)
EXECUTE FUNCTION public.cancel_disabled_attendance_queue();

-- Limpeza imediata: cancelar tudo que está pendente de empresas com automação já desativada
UPDATE public.attendance_auto_message_queue q
   SET status = 'failed',
       processed_at = now(),
       last_error = COALESCE(last_error, 'Cancelado: automação desativada nas configurações')
  FROM public.attendance_settings s
 WHERE q.company_id = s.company_id
   AND q.status IN ('pending','processing')
   AND (
        (q.message_kind = 'off_hours' AND COALESCE((s.business_hours->>'off_hours_enabled')::BOOLEAN, false) = false)
     OR (q.message_kind = 'welcome'   AND COALESCE(s.general->>'welcome_message','') = '')
     OR (q.message_kind = 'wait_time' AND COALESCE((s.general->>'show_wait_time')::BOOLEAN, false) = false)
   );