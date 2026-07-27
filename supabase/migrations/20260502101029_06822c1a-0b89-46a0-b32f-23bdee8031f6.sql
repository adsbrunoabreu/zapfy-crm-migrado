-- ============================================================
-- APPOINTMENTS MODULE — SCHEMA BASE
-- ============================================================

-- ENUMS ------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.appointment_status AS ENUM (
    'scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_reminder_status AS ENUM (
    'pending', 'sent', 'failed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.appointment_reminder_kind AS ENUM (
    'client_reminder', 'pro_daily_report'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TABLE: appointment_professionals
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointment_professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  specialty TEXT,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  avatar_url TEXT,
  linked_user_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appt_pro_company ON public.appointment_professionals(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_appt_pro_user ON public.appointment_professionals(linked_user_id) WHERE linked_user_id IS NOT NULL;

ALTER TABLE public.appointment_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view professionals"
  ON public.appointment_professionals FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins manage professionals"
  ON public.appointment_professionals FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id));

CREATE POLICY "Admins update professionals"
  ON public.appointment_professionals FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Admins delete professionals"
  ON public.appointment_professionals FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Masters manage professionals"
  ON public.appointment_professionals FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

CREATE TRIGGER trg_appt_pro_updated
  BEFORE UPDATE ON public.appointment_professionals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TABLE: appointment_reasons
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointment_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#10b981',
  default_duration_minutes INTEGER NOT NULL DEFAULT 60,
  -- [{offset_minutes:1440, channel:'whatsapp'|'email', template:'...', subject:'...'}]
  client_reminders JSONB NOT NULL DEFAULT '[]'::jsonb,
  automation_enabled BOOLEAN NOT NULL DEFAULT false,
  -- [{trigger:'on_create'|'on_confirm'|'on_complete'|'on_cancel'|'on_no_show', actions:[{type, params}]}]
  automation_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appt_reason_company ON public.appointment_reasons(company_id, is_active);

ALTER TABLE public.appointment_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view reasons"
  ON public.appointment_reasons FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins insert reasons"
  ON public.appointment_reasons FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id));

CREATE POLICY "Admins update reasons"
  ON public.appointment_reasons FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Admins delete reasons"
  ON public.appointment_reasons FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Masters manage reasons"
  ON public.appointment_reasons FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

CREATE TRIGGER trg_appt_reason_updated
  BEFORE UPDATE ON public.appointment_reasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TABLE: appointments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  professional_id UUID NOT NULL REFERENCES public.appointment_professionals(id) ON DELETE RESTRICT,
  reason_id UUID REFERENCES public.appointment_reasons(id) ON DELETE SET NULL,
  lead_id UUID,
  title TEXT,
  notes TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  status public.appointment_status NOT NULL DEFAULT 'scheduled',
  cancel_reason TEXT,
  meeting_url TEXT,
  location TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT appointments_time_valid CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_appt_company_start ON public.appointments(company_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appt_pro_start ON public.appointments(professional_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appt_lead ON public.appointments(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appt_status ON public.appointments(company_id, status);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Members insert appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id));

CREATE POLICY "Members update appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id));

CREATE POLICY "Members delete appointments"
  ON public.appointments FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id));

CREATE POLICY "Masters manage appointments"
  ON public.appointments FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

CREATE TRIGGER trg_appt_updated
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TABLE: appointment_reminders
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  kind public.appointment_reminder_kind NOT NULL DEFAULT 'client_reminder',
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'email')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status public.appointment_reminder_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  error TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appt_rem_due ON public.appointment_reminders(status, scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_appt_rem_appt ON public.appointment_reminders(appointment_id);

ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view reminders"
  ON public.appointment_reminders FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

-- Inserts/updates apenas via triggers/edge functions (service role)
CREATE POLICY "No direct insert reminders"
  ON public.appointment_reminders FOR INSERT TO authenticated WITH CHECK (false);
CREATE POLICY "No direct update reminders"
  ON public.appointment_reminders FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No direct delete reminders"
  ON public.appointment_reminders FOR DELETE TO authenticated USING (false);

CREATE POLICY "Masters manage reminders"
  ON public.appointment_reminders FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

CREATE TRIGGER trg_appt_rem_updated
  BEFORE UPDATE ON public.appointment_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TABLE: appointment_audit
-- ============================================================
CREATE TABLE IF NOT EXISTS public.appointment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  changed_by UUID,
  event_type TEXT NOT NULL,
  previous JSONB,
  current JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appt_audit_appt ON public.appointment_audit(appointment_id, created_at DESC);

ALTER TABLE public.appointment_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view audit"
  ON public.appointment_audit FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Masters manage audit"
  ON public.appointment_audit FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

-- ============================================================
-- TABLE: professional_report_preferences
-- ============================================================
CREATE TABLE IF NOT EXISTS public.professional_report_preferences (
  professional_id UUID PRIMARY KEY REFERENCES public.appointment_professionals(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  daily_email_enabled BOOLEAN NOT NULL DEFAULT true,
  daily_whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  daily_send_time TIME NOT NULL DEFAULT '07:00',
  whatsapp_number TEXT,
  email_override TEXT,
  last_sent_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_report_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view prefs"
  ON public.professional_report_preferences FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins insert prefs"
  ON public.professional_report_preferences FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id));

CREATE POLICY "Admins update prefs"
  ON public.professional_report_preferences FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Admins delete prefs"
  ON public.professional_report_preferences FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Masters manage prefs"
  ON public.professional_report_preferences FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

CREATE TRIGGER trg_appt_prefs_updated
  BEFORE UPDATE ON public.professional_report_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- TRIGGERS / FUNCTIONS
-- ============================================================

-- Calcula end_at se vier nulo, baseado na duração padrão do motivo
CREATE OR REPLACE FUNCTION public.appointments_set_defaults()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duration INTEGER;
BEGIN
  IF NEW.end_at IS NULL OR NEW.end_at <= NEW.start_at THEN
    SELECT COALESCE(default_duration_minutes, 60) INTO v_duration
      FROM public.appointment_reasons
      WHERE id = NEW.reason_id;
    NEW.end_at := NEW.start_at + (COALESCE(v_duration, 60) || ' minutes')::interval;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_appt_set_defaults
  BEFORE INSERT OR UPDATE OF start_at, end_at, reason_id
  ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_set_defaults();

-- Gera/atualiza lembretes do cliente quando o compromisso muda
CREATE OR REPLACE FUNCTION public.appointments_sync_reminders()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_reminders JSONB;
  v_item JSONB;
  v_when TIMESTAMPTZ;
BEGIN
  -- Cancela lembretes pendentes se status virou cancelado/no_show
  IF NEW.status IN ('cancelled', 'no_show', 'completed') THEN
    UPDATE public.appointment_reminders
       SET status = 'cancelled', updated_at = now()
     WHERE appointment_id = NEW.id
       AND status = 'pending'
       AND kind = 'client_reminder';
    RETURN NEW;
  END IF;

  -- Em update sem mudança em start_at nem reason_id, não recalcula
  IF TG_OP = 'UPDATE'
     AND OLD.start_at = NEW.start_at
     AND COALESCE(OLD.reason_id::text, '') = COALESCE(NEW.reason_id::text, '')
     AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Limpa lembretes pendentes anteriores
  DELETE FROM public.appointment_reminders
   WHERE appointment_id = NEW.id
     AND status = 'pending'
     AND kind = 'client_reminder';

  -- Busca regras do motivo
  SELECT client_reminders INTO v_reminders
    FROM public.appointment_reasons
   WHERE id = NEW.reason_id;

  IF v_reminders IS NULL OR jsonb_array_length(v_reminders) = 0 THEN
    RETURN NEW;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_reminders) LOOP
    v_when := NEW.start_at - ((COALESCE((v_item->>'offset_minutes')::integer, 60)) || ' minutes')::interval;
    -- Só agenda se for no futuro
    IF v_when > now() THEN
      INSERT INTO public.appointment_reminders
        (appointment_id, company_id, kind, channel, scheduled_for, payload)
      VALUES (
        NEW.id, NEW.company_id, 'client_reminder',
        COALESCE(v_item->>'channel', 'whatsapp'),
        v_when,
        v_item
      );
    END IF;
  END LOOP;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_appt_sync_reminders
  AFTER INSERT OR UPDATE OF start_at, reason_id, status
  ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_sync_reminders();

-- Audit trail
CREATE OR REPLACE FUNCTION public.appointments_audit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.appointment_audit (appointment_id, company_id, changed_by, event_type, current)
    VALUES (NEW.id, NEW.company_id, NEW.created_by, 'created', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.appointment_audit (appointment_id, company_id, changed_by, event_type, previous, current)
      VALUES (NEW.id, NEW.company_id, auth.uid(), 'status_changed',
              jsonb_build_object('status', OLD.status),
              jsonb_build_object('status', NEW.status, 'cancel_reason', NEW.cancel_reason));
    END IF;
    IF OLD.start_at IS DISTINCT FROM NEW.start_at OR OLD.end_at IS DISTINCT FROM NEW.end_at THEN
      INSERT INTO public.appointment_audit (appointment_id, company_id, changed_by, event_type, previous, current)
      VALUES (NEW.id, NEW.company_id, auth.uid(), 'rescheduled',
              jsonb_build_object('start_at', OLD.start_at, 'end_at', OLD.end_at),
              jsonb_build_object('start_at', NEW.start_at, 'end_at', NEW.end_at));
    END IF;
    IF OLD.professional_id IS DISTINCT FROM NEW.professional_id THEN
      INSERT INTO public.appointment_audit (appointment_id, company_id, changed_by, event_type, previous, current)
      VALUES (NEW.id, NEW.company_id, auth.uid(), 'professional_changed',
              jsonb_build_object('professional_id', OLD.professional_id),
              jsonb_build_object('professional_id', NEW.professional_id));
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_appt_audit
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_audit();

-- Auto-cria preferences ao criar profissional
CREATE OR REPLACE FUNCTION public.appointment_pro_default_prefs()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.professional_report_preferences (professional_id, company_id)
  VALUES (NEW.id, NEW.company_id)
  ON CONFLICT (professional_id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_appt_pro_default_prefs
  AFTER INSERT ON public.appointment_professionals
  FOR EACH ROW EXECUTE FUNCTION public.appointment_pro_default_prefs();