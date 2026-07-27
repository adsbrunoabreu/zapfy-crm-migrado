
-- =========================================================
-- 1) PERMITIR 1:N: REMOVER UNIQUE INDEX
-- =========================================================
DROP INDEX IF EXISTS public.uniq_medical_appointments_lead;
CREATE INDEX IF NOT EXISTS idx_medical_appointments_lead
  ON public.medical_appointments(lead_id) WHERE lead_id IS NOT NULL;

-- =========================================================
-- 2) AJUSTAR sync_lead_to_medical PARA O NOVO MODELO
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
  v_existing_future uuid;
  v_cpf varchar(20);
BEGIN
  -- Apenas para empresas médicas
  SELECT crm_vertical INTO v_vertical FROM public.companies WHERE id = NEW.company_id;
  IF v_vertical IS DISTINCT FROM 'medical' THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_practice_id
  FROM public.medical_practices
  WHERE company_id = NEW.company_id
  ORDER BY created_at ASC LIMIT 1;
  IF v_practice_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_cpf := NULLIF(regexp_replace(COALESCE(NEW.document, ''), '\D', '', 'g'), '');

  -- Usa vínculo direto se já existir
  v_patient_id := NEW.medical_patient_id;

  IF v_patient_id IS NULL THEN
    SELECT id INTO v_patient_id
    FROM public.medical_patients
    WHERE company_id = NEW.company_id
      AND (
        (v_cpf IS NOT NULL AND regexp_replace(COALESCE(cpf, ''), '\D', '', 'g') = v_cpf)
        OR (NEW.phone IS NOT NULL AND phone = NEW.phone)
      )
    ORDER BY created_at ASC LIMIT 1;
  END IF;

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

  -- Grava vínculo no lead se ainda não estiver (não viola immutable porque BEFORE com NEW)
  -- Como este é AFTER trigger, faz UPDATE separado se necessário
  IF NEW.medical_patient_id IS DISTINCT FROM v_patient_id
     AND NOT (COALESCE(OLD.status, NEW.status) IN ('won','lost') AND NEW.status IN ('won','lost')) THEN
    UPDATE public.leads SET medical_patient_id = v_patient_id
    WHERE id = NEW.id AND medical_patient_id IS DISTINCT FROM v_patient_id;
  END IF;

  -- Won/Lost: afeta apenas o appointment futuro em aberto
  IF NEW.status = 'won' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'won') THEN
    UPDATE public.medical_appointments
       SET status = 'completed', payment_status = 'paid', updated_at = now()
     WHERE patient_id = v_patient_id
       AND status IN ('scheduled','confirmed')
       AND scheduled_date >= now() - interval '1 day';
    RETURN NEW;
  ELSIF NEW.status = 'lost' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'lost') THEN
    UPDATE public.medical_appointments
       SET status = 'cancelled', updated_at = now()
     WHERE patient_id = v_patient_id
       AND status IN ('scheduled','confirmed');
    RETURN NEW;
  END IF;

  -- Criação automática de appointment só se o card tem dados de agendamento E não existe futuro em aberto
  IF NEW.scheduled_at IS NOT NULL AND NEW.medical_doctor_id IS NOT NULL THEN
    SELECT id INTO v_existing_future
    FROM public.medical_appointments
    WHERE patient_id = v_patient_id
      AND status IN ('scheduled','confirmed')
      AND scheduled_date >= now() - interval '1 day'
    ORDER BY scheduled_date ASC LIMIT 1;

    IF v_existing_future IS NULL THEN
      INSERT INTO public.medical_appointments (
        practice_id, company_id, doctor_id, patient_id, procedure_id,
        scheduled_date, duration_minutes, status, price, payment_status,
        source, lead_id
      ) VALUES (
        v_practice_id, NEW.company_id, NEW.medical_doctor_id, v_patient_id,
        NEW.medical_procedure_id,
        NEW.scheduled_at::timestamp,
        COALESCE(NEW.duration_minutes, 30),
        COALESCE(NEW.appointment_status, 'scheduled'),
        NEW.value,
        COALESCE(NEW.payment_status, 'pending'),
        NEW.source,
        NEW.id
      );
    ELSE
      -- Atualiza o futuro existente
      UPDATE public.medical_appointments SET
        doctor_id = NEW.medical_doctor_id,
        procedure_id = COALESCE(NEW.medical_procedure_id, procedure_id),
        scheduled_date = NEW.scheduled_at::timestamp,
        duration_minutes = COALESCE(NEW.duration_minutes, duration_minutes),
        status = COALESCE(NEW.appointment_status, status),
        price = COALESCE(NEW.value, price),
        payment_status = COALESCE(NEW.payment_status, payment_status),
        lead_id = COALESCE(lead_id, NEW.id),
        updated_at = now()
      WHERE id = v_existing_future;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'sync_lead_to_medical falhou para lead %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- =========================================================
-- 3) BACKFILL REVERSO: criar 1 lead por paciente sem card
-- =========================================================
DO $$
DECLARE
  r RECORD;
  v_pipeline_id uuid;
  v_stage_new uuid;
  v_stage_contact uuid;
  v_stage_won uuid;
  v_stage_lost uuid;
  v_lead_id uuid;
  v_status text;
  v_stage uuid;
  v_doctor uuid;
  v_proc uuid;
  v_sched timestamptz;
  v_has_future boolean;
  v_has_completed boolean;
  v_has_only_failed boolean;
  v_appt_count int;
BEGIN
  FOR r IN
    SELECT p.*
    FROM public.medical_patients p
    JOIN public.companies c ON c.id = p.company_id
    WHERE c.crm_vertical = 'medical'
      AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.medical_patient_id = p.id)
  LOOP
    -- Pipeline padrão (ou primeiro) da empresa
    SELECT id INTO v_pipeline_id FROM public.pipelines
      WHERE company_id = r.company_id
      ORDER BY is_default DESC, created_at ASC LIMIT 1;
    CONTINUE WHEN v_pipeline_id IS NULL;

    -- Stages
    SELECT id INTO v_stage_new   FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline_id AND stage_type='open' ORDER BY position ASC LIMIT 1;
    SELECT id INTO v_stage_contact FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline_id AND stage_type='open' ORDER BY position ASC OFFSET 1 LIMIT 1;
    SELECT id INTO v_stage_won   FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline_id AND stage_type='won' ORDER BY position ASC LIMIT 1;
    SELECT id INTO v_stage_lost  FROM public.pipeline_stages
      WHERE pipeline_id = v_pipeline_id AND stage_type='lost' ORDER BY position ASC LIMIT 1;

    -- Histórico do paciente
    SELECT count(*) INTO v_appt_count FROM public.medical_appointments
      WHERE patient_id = r.id;
    SELECT EXISTS (SELECT 1 FROM public.medical_appointments
      WHERE patient_id = r.id AND status IN ('scheduled','confirmed')
        AND scheduled_date >= now() - interval '1 day') INTO v_has_future;
    SELECT EXISTS (SELECT 1 FROM public.medical_appointments
      WHERE patient_id = r.id AND status = 'completed') INTO v_has_completed;
    SELECT (v_appt_count > 0 AND NOT EXISTS (SELECT 1 FROM public.medical_appointments
      WHERE patient_id = r.id AND status NOT IN ('cancelled','no_show'))) INTO v_has_only_failed;

    IF v_has_future THEN
      v_status := 'new'; v_stage := COALESCE(v_stage_contact, v_stage_new);
    ELSIF v_has_completed THEN
      v_status := 'won'; v_stage := v_stage_won;
    ELSIF v_has_only_failed THEN
      v_status := 'lost'; v_stage := v_stage_lost;
    ELSE
      v_status := 'new'; v_stage := v_stage_new;
    END IF;

    -- Dados do próximo/último appointment
    SELECT doctor_id, procedure_id, scheduled_date
      INTO v_doctor, v_proc, v_sched
    FROM public.medical_appointments
    WHERE patient_id = r.id
      AND status IN ('scheduled','confirmed')
      AND scheduled_date >= now() - interval '1 day'
    ORDER BY scheduled_date ASC LIMIT 1;

    IF v_doctor IS NULL THEN
      SELECT doctor_id, procedure_id, scheduled_date
        INTO v_doctor, v_proc, v_sched
      FROM public.medical_appointments
      WHERE patient_id = r.id
      ORDER BY scheduled_date DESC LIMIT 1;
    END IF;

    -- Cria o lead
    INSERT INTO public.leads (
      company_id, pipeline_id, stage_id, name, phone, email, value, status,
      document, birth_date, source, medical_patient_id,
      medical_doctor_id, medical_procedure_id, scheduled_at,
      gender, allergies
    ) VALUES (
      r.company_id, v_pipeline_id, v_stage, r.full_name, r.phone, r.email,
      NULLIF(r.lifetime_value, 0), v_status::lead_status,
      r.cpf, r.date_of_birth, 'medical_backfill', r.id,
      v_doctor, v_proc,
      CASE WHEN v_sched >= now() - interval '1 day' THEN v_sched ELSE NULL END,
      r.gender, r.allergies
    )
    RETURNING id INTO v_lead_id;

    -- Vincula appointments existentes a esse lead
    UPDATE public.medical_appointments
       SET lead_id = v_lead_id
     WHERE patient_id = r.id AND lead_id IS NULL;
  END LOOP;
END $$;
