
-- =========================================================
-- 1) NOVAS COLUNAS EM leads (campos clínicos opcionais)
-- =========================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS medical_doctor_id uuid REFERENCES public.medical_doctors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS medical_procedure_id uuid REFERENCES public.medical_procedures(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS appointment_status varchar(50),
  ADD COLUMN IF NOT EXISTS payment_status varchar(50),
  ADD COLUMN IF NOT EXISTS gender varchar(20),
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS insurance text;

CREATE INDEX IF NOT EXISTS idx_leads_medical_doctor ON public.leads(medical_doctor_id) WHERE medical_doctor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_scheduled_at ON public.leads(company_id, scheduled_at) WHERE scheduled_at IS NOT NULL;

-- =========================================================
-- 2) VÍNCULO medical_appointments -> lead (1:1 opcional)
-- =========================================================
ALTER TABLE public.medical_appointments
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_medical_appointments_lead
  ON public.medical_appointments(lead_id) WHERE lead_id IS NOT NULL;

-- =========================================================
-- 3) FUNÇÃO DE SINCRONIZAÇÃO
-- =========================================================
CREATE OR REPLACE FUNCTION public.sync_lead_to_medical()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vertical text;
  v_practice_id uuid;
  v_patient_id uuid;
  v_appointment_id uuid;
  v_appt_status varchar(50);
  v_pay_status varchar(50);
  v_cpf varchar(20);
BEGIN
  -- 1. Empresa médica?
  SELECT crm_vertical INTO v_vertical
  FROM public.companies WHERE id = NEW.company_id;
  IF v_vertical IS DISTINCT FROM 'medical' THEN
    RETURN NEW;
  END IF;

  -- 2. Practice da empresa (pega o primeiro). Sem practice, aborta silencioso.
  SELECT id INTO v_practice_id
  FROM public.medical_practices
  WHERE company_id = NEW.company_id
  ORDER BY created_at ASC
  LIMIT 1;
  IF v_practice_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 3. Upsert do PACIENTE
  v_cpf := NULLIF(regexp_replace(COALESCE(NEW.document, ''), '\D', '', 'g'), '');

  -- match por CPF, telefone ou nome+phone
  SELECT id INTO v_patient_id
  FROM public.medical_patients
  WHERE company_id = NEW.company_id
    AND (
      (v_cpf IS NOT NULL AND regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = v_cpf)
      OR (NEW.phone IS NOT NULL AND phone = NEW.phone)
    )
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_patient_id IS NULL THEN
    INSERT INTO public.medical_patients (
      practice_id, company_id, full_name, email, phone, cpf, date_of_birth, gender, allergies, status
    ) VALUES (
      v_practice_id, NEW.company_id, NEW.name, NEW.email, NEW.phone,
      v_cpf, NEW.birth_date, NEW.gender, NEW.allergies, 'active'
    )
    RETURNING id INTO v_patient_id;
  ELSE
    UPDATE public.medical_patients SET
      full_name = COALESCE(NULLIF(NEW.name, ''), full_name),
      email = COALESCE(NEW.email, email),
      phone = COALESCE(NEW.phone, phone),
      cpf = COALESCE(v_cpf, cpf),
      date_of_birth = COALESCE(NEW.birth_date, date_of_birth),
      gender = COALESCE(NEW.gender, gender),
      allergies = COALESCE(NEW.allergies, allergies),
      updated_at = now()
    WHERE id = v_patient_id;
  END IF;

  -- 4. Determinar status do appointment/pagamento conforme estado do lead
  v_appt_status := COALESCE(NEW.appointment_status, 'scheduled');
  v_pay_status  := COALESCE(NEW.payment_status, 'pending');

  IF NEW.status = 'won' THEN
    v_appt_status := 'completed';
    v_pay_status := 'paid';
  ELSIF NEW.status = 'lost' THEN
    v_appt_status := 'cancelled';
  END IF;

  -- 5. Upsert do APPOINTMENT (só cria se houver agendamento ou procedimento ou médico)
  SELECT id INTO v_appointment_id
  FROM public.medical_appointments WHERE lead_id = NEW.id LIMIT 1;

  IF v_appointment_id IS NOT NULL THEN
    -- Sempre atualiza para refletir o lead
    UPDATE public.medical_appointments SET
      patient_id = v_patient_id,
      doctor_id = COALESCE(NEW.medical_doctor_id, doctor_id),
      procedure_id = NEW.medical_procedure_id,
      scheduled_date = COALESCE(NEW.scheduled_at::timestamp, scheduled_date),
      duration_minutes = COALESCE(NEW.duration_minutes, duration_minutes, 30),
      status = v_appt_status,
      price = COALESCE(NEW.value, price),
      payment_status = v_pay_status,
      source = COALESCE(NEW.source, source),
      updated_at = now()
    WHERE id = v_appointment_id;
  ELSIF NEW.scheduled_at IS NOT NULL AND NEW.medical_doctor_id IS NOT NULL THEN
    -- Cria appointment novo
    INSERT INTO public.medical_appointments (
      practice_id, company_id, doctor_id, patient_id, procedure_id,
      scheduled_date, duration_minutes, status, price, payment_status,
      source, lead_id
    ) VALUES (
      v_practice_id, NEW.company_id, NEW.medical_doctor_id, v_patient_id,
      NEW.medical_procedure_id,
      NEW.scheduled_at::timestamp,
      COALESCE(NEW.duration_minutes, 30),
      v_appt_status,
      NEW.value,
      v_pay_status,
      NEW.source,
      NEW.id
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Não bloquear a operação no lead se a sync falhar
  RAISE WARNING 'sync_lead_to_medical falhou para lead %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- =========================================================
-- 4) TRIGGER (AFTER INSERT/UPDATE)
-- =========================================================
DROP TRIGGER IF EXISTS trg_sync_lead_to_medical ON public.leads;
CREATE TRIGGER trg_sync_lead_to_medical
  AFTER INSERT OR UPDATE OF
    name, phone, email, document, birth_date, value, source, status, stage_id,
    medical_doctor_id, medical_procedure_id, scheduled_at, duration_minutes,
    appointment_status, payment_status, gender, allergies, insurance
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_lead_to_medical();

-- =========================================================
-- 5) BACKFILL (cria pacientes para leads existentes em empresas médicas)
-- =========================================================
DO $$
DECLARE
  r RECORD;
  v_practice_id uuid;
  v_patient_id uuid;
  v_cpf varchar(20);
BEGIN
  FOR r IN
    SELECT l.* FROM public.leads l
    JOIN public.companies c ON c.id = l.company_id
    WHERE c.crm_vertical = 'medical'
      AND (l.phone IS NOT NULL OR l.document IS NOT NULL)
  LOOP
    SELECT id INTO v_practice_id FROM public.medical_practices
      WHERE company_id = r.company_id ORDER BY created_at ASC LIMIT 1;
    CONTINUE WHEN v_practice_id IS NULL;

    v_cpf := NULLIF(regexp_replace(COALESCE(r.document, ''), '\D', '', 'g'), '');

    SELECT id INTO v_patient_id FROM public.medical_patients
    WHERE company_id = r.company_id
      AND (
        (v_cpf IS NOT NULL AND regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = v_cpf)
        OR (r.phone IS NOT NULL AND phone = r.phone)
      )
    ORDER BY created_at ASC LIMIT 1;

    IF v_patient_id IS NULL THEN
      INSERT INTO public.medical_patients (
        practice_id, company_id, full_name, email, phone, cpf, date_of_birth, status
      ) VALUES (
        v_practice_id, r.company_id, r.name, r.email, r.phone, v_cpf, r.birth_date, 'active'
      );
    END IF;
  END LOOP;
END $$;
