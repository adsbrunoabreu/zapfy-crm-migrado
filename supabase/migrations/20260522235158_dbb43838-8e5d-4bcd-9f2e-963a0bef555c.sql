
-- =========================================================
-- Item 1: company_notification_prefs
-- =========================================================
CREATE TABLE IF NOT EXISTS public.company_notification_prefs (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  email_new_lead boolean NOT NULL DEFAULT false,
  email_new_message boolean NOT NULL DEFAULT false,
  email_daily_report boolean NOT NULL DEFAULT false,
  email_recipients text[] NOT NULL DEFAULT '{}'::text[],
  daily_report_hour smallint NOT NULL DEFAULT 8 CHECK (daily_report_hour BETWEEN 0 AND 23),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_notification_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Masters manage notif prefs" ON public.company_notification_prefs;
CREATE POLICY "Masters manage notif prefs"
  ON public.company_notification_prefs
  TO authenticated
  USING (is_master(auth.uid()))
  WITH CHECK (is_master(auth.uid()));

DROP POLICY IF EXISTS "Managers view notif prefs" ON public.company_notification_prefs;
CREATE POLICY "Managers view notif prefs"
  ON public.company_notification_prefs FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_manager(auth.uid()));

DROP POLICY IF EXISTS "Managers insert notif prefs" ON public.company_notification_prefs;
CREATE POLICY "Managers insert notif prefs"
  ON public.company_notification_prefs FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_manager(auth.uid()));

DROP POLICY IF EXISTS "Managers update notif prefs" ON public.company_notification_prefs;
CREATE POLICY "Managers update notif prefs"
  ON public.company_notification_prefs FOR UPDATE
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_manager(auth.uid()))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_manager(auth.uid()));

DROP TRIGGER IF EXISTS trg_cnp_updated_at ON public.company_notification_prefs;
CREATE TRIGGER trg_cnp_updated_at
  BEFORE UPDATE ON public.company_notification_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- Item 2: campos médicos em appointment_professionals
-- =========================================================
ALTER TABLE public.appointment_professionals
  ADD COLUMN IF NOT EXISTS crm text,
  ADD COLUMN IF NOT EXISTS council_type text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS medical_doctor_id uuid REFERENCES public.medical_doctors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_appt_pro_medical_doctor
  ON public.appointment_professionals(medical_doctor_id)
  WHERE medical_doctor_id IS NOT NULL;

-- Trigger: sincroniza appointment_professionals -> medical_doctors em empresas medical
CREATE OR REPLACE FUNCTION public.sync_professional_to_medical_doctor()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vertical text;
  v_practice_id uuid;
  v_doctor_id uuid;
BEGIN
  SELECT crm_vertical INTO v_vertical FROM public.companies WHERE id = NEW.company_id;
  IF v_vertical IS DISTINCT FROM 'medical' THEN
    RETURN NEW;
  END IF;

  -- garante practice
  SELECT id INTO v_practice_id
  FROM public.medical_practices
  WHERE company_id = NEW.company_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_practice_id IS NULL THEN
    INSERT INTO public.medical_practices (company_id, crm_type)
    VALUES (NEW.company_id, 'clinic')
    RETURNING id INTO v_practice_id;
  END IF;

  v_doctor_id := NEW.medical_doctor_id;

  IF v_doctor_id IS NULL THEN
    -- tenta achar por nome dentro da empresa
    SELECT id INTO v_doctor_id
    FROM public.medical_doctors
    WHERE company_id = NEW.company_id
      AND lower(full_name) = lower(NEW.name)
    LIMIT 1;
  END IF;

  IF v_doctor_id IS NULL THEN
    INSERT INTO public.medical_doctors (
      practice_id, company_id, full_name, email, phone,
      professional_registry, specialization, bio, avatar_url, active
    ) VALUES (
      v_practice_id, NEW.company_id, NEW.name, NEW.email, NEW.phone,
      NEW.crm, NEW.specialty, NEW.bio, NEW.avatar_url, NEW.is_active
    )
    RETURNING id INTO v_doctor_id;
  ELSE
    UPDATE public.medical_doctors SET
      full_name = NEW.name,
      email = NEW.email,
      phone = NEW.phone,
      professional_registry = COALESCE(NEW.crm, professional_registry),
      specialization = COALESCE(NEW.specialty, specialization),
      bio = COALESCE(NEW.bio, bio),
      avatar_url = COALESCE(NEW.avatar_url, avatar_url),
      active = NEW.is_active,
      updated_at = now()
    WHERE id = v_doctor_id;
  END IF;

  IF NEW.medical_doctor_id IS DISTINCT FROM v_doctor_id THEN
    NEW.medical_doctor_id := v_doctor_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_prof_to_doctor ON public.appointment_professionals;
CREATE TRIGGER trg_sync_prof_to_doctor
  BEFORE INSERT OR UPDATE ON public.appointment_professionals
  FOR EACH ROW EXECUTE FUNCTION public.sync_professional_to_medical_doctor();

-- =========================================================
-- Backfill: medical_doctors sem profissional vinculado
-- =========================================================
INSERT INTO public.appointment_professionals (
  company_id, name, email, phone, specialty, color, avatar_url,
  is_active, crm, medical_doctor_id
)
SELECT
  d.company_id,
  d.full_name,
  d.email,
  d.phone,
  d.specialization,
  '#3b82f6',
  d.avatar_url,
  COALESCE(d.active, true),
  d.professional_registry,
  d.id
FROM public.medical_doctors d
WHERE NOT EXISTS (
  SELECT 1 FROM public.appointment_professionals p
  WHERE p.medical_doctor_id = d.id
     OR (p.company_id = d.company_id AND lower(p.name) = lower(d.full_name))
);

-- Conecta profissionais existentes que casam por nome
UPDATE public.appointment_professionals p
SET medical_doctor_id = d.id
FROM public.medical_doctors d
WHERE p.medical_doctor_id IS NULL
  AND p.company_id = d.company_id
  AND lower(p.name) = lower(d.full_name);
