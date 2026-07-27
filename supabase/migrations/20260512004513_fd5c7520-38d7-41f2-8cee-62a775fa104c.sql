-- 1) Novo valor de enum
ALTER TYPE public.appointment_reminder_kind ADD VALUE IF NOT EXISTS 'feedback_email';

-- 2) Trigger atualizado: 24h antes ao confirmar + feedback_email ao cancelar
CREATE OR REPLACE FUNCTION public.appointments_sync_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reminders JSONB;
  v_item JSONB;
  v_when TIMESTAMPTZ;
  v_24h TIMESTAMPTZ;
  v_status_changed BOOLEAN := (TG_OP = 'INSERT') OR (OLD.status IS DISTINCT FROM NEW.status);
BEGIN
  -- (a) Cancelamento: enfileira feedback_email imediato + cancela pendentes
  IF NEW.status = 'cancelled' AND v_status_changed THEN
    UPDATE public.appointment_reminders
       SET status = 'cancelled', updated_at = now()
     WHERE appointment_id = NEW.id
       AND status = 'pending'
       AND kind = 'client_reminder';

    -- evita duplicado se já houver feedback enfileirado
    IF NOT EXISTS (
      SELECT 1 FROM public.appointment_reminders
       WHERE appointment_id = NEW.id AND kind = 'feedback_email'
    ) THEN
      INSERT INTO public.appointment_reminders
        (appointment_id, company_id, kind, channel, scheduled_for, payload)
      VALUES (
        NEW.id, NEW.company_id, 'feedback_email', 'email', now(),
        jsonb_build_object('reason', NEW.cancel_reason)
      );
    END IF;
    RETURN NEW;
  END IF;

  -- (b) No-show / completed: cancela lembretes pendentes
  IF NEW.status IN ('no_show', 'completed') THEN
    UPDATE public.appointment_reminders
       SET status = 'cancelled', updated_at = now()
     WHERE appointment_id = NEW.id
       AND status = 'pending'
       AND kind = 'client_reminder';
    RETURN NEW;
  END IF;

  -- (c) Em update sem mudança em start_at/reason/status, não recalcula
  IF TG_OP = 'UPDATE'
     AND OLD.start_at = NEW.start_at
     AND COALESCE(OLD.reason_id::text, '') = COALESCE(NEW.reason_id::text, '')
     AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- (d) Limpa lembretes pendentes anteriores
  DELETE FROM public.appointment_reminders
   WHERE appointment_id = NEW.id
     AND status = 'pending'
     AND kind = 'client_reminder';

  -- (e) Lembretes do motivo (regras configuradas)
  SELECT client_reminders INTO v_reminders
    FROM public.appointment_reasons
   WHERE id = NEW.reason_id;

  IF v_reminders IS NOT NULL AND jsonb_array_length(v_reminders) > 0 THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_reminders) LOOP
      v_when := NEW.start_at - ((COALESCE((v_item->>'offset_minutes')::integer, 60)) || ' minutes')::interval;
      IF v_when > now() THEN
        INSERT INTO public.appointment_reminders
          (appointment_id, company_id, kind, channel, scheduled_for, payload)
        VALUES (
          NEW.id, NEW.company_id, 'client_reminder',
          COALESCE(v_item->>'channel', 'whatsapp'),
          v_when, v_item
        );
      END IF;
    END LOOP;
  END IF;

  -- (f) Lembrete fixo 24h antes ao Confirmar (se ainda não houver um equivalente)
  IF NEW.status = 'confirmed' THEN
    v_24h := NEW.start_at - INTERVAL '24 hours';
    IF v_24h > now() AND NOT EXISTS (
      SELECT 1 FROM public.appointment_reminders
       WHERE appointment_id = NEW.id
         AND kind = 'client_reminder'
         AND status = 'pending'
         AND scheduled_for BETWEEN v_24h - INTERVAL '15 minutes' AND v_24h + INTERVAL '15 minutes'
    ) THEN
      INSERT INTO public.appointment_reminders
        (appointment_id, company_id, kind, channel, scheduled_for, payload)
      VALUES (
        NEW.id, NEW.company_id, 'client_reminder', 'whatsapp', v_24h,
        jsonb_build_object('offset_minutes', 1440, 'auto_24h', true)
      );
    END IF;
  END IF;

  RETURN NEW;
END
$$;

-- 3) Bloquear edições estruturais quando status = in_progress
CREATE OR REPLACE FUNCTION public.appointments_block_in_progress_edits()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'in_progress' AND NEW.status = 'in_progress' THEN
    IF NEW.start_at        IS DISTINCT FROM OLD.start_at        OR
       NEW.end_at          IS DISTINCT FROM OLD.end_at          OR
       NEW.professional_id IS DISTINCT FROM OLD.professional_id OR
       NEW.lead_id         IS DISTINCT FROM OLD.lead_id         OR
       NEW.reason_id       IS DISTINCT FROM OLD.reason_id       OR
       NEW.title           IS DISTINCT FROM OLD.title           OR
       NEW.meeting_url     IS DISTINCT FROM OLD.meeting_url     OR
       NEW.location        IS DISTINCT FROM OLD.location        THEN
      RAISE EXCEPTION 'Agendamento em curso: só é possível alterar status, motivo de cancelamento, anotações e checklist'
        USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_appt_block_in_progress ON public.appointments;
CREATE TRIGGER trg_appt_block_in_progress
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_block_in_progress_edits();
