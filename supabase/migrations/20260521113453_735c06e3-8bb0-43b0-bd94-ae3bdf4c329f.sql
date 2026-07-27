
-- ============================================================
-- PACOTE B — Sincronizar Pipeline Médico → medical_payments
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_lead_to_medical()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $function$
DECLARE
  v_vertical text;
  v_practice_id uuid;
  v_patient_id uuid;
  v_existing_future uuid;
  v_appt_id uuid;
  v_cpf varchar(20);
  v_realized numeric;
  v_external_key varchar(50);
BEGIN
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

  IF NEW.medical_patient_id IS DISTINCT FROM v_patient_id
     AND NOT (COALESCE(OLD.status, NEW.status) IN ('won','lost') AND NEW.status IN ('won','lost')) THEN
    UPDATE public.leads SET medical_patient_id = v_patient_id
    WHERE id = NEW.id AND medical_patient_id IS DISTINCT FROM v_patient_id;
  END IF;

  v_external_key := 'lead:' || NEW.id::text;

  -- Ganho ---------------------------------------------------------------
  IF NEW.status = 'won' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'won') THEN
    UPDATE public.medical_appointments
       SET status = 'completed', payment_status = 'paid', updated_at = now()
     WHERE patient_id = v_patient_id
       AND status IN ('scheduled','confirmed')
       AND scheduled_date >= now() - interval '1 day';

    -- Localizar appointment vinculado (se houver)
    SELECT id INTO v_appt_id FROM public.medical_appointments
      WHERE lead_id = NEW.id ORDER BY scheduled_date DESC LIMIT 1;

    -- Criar/atualizar pagamento automático
    v_realized := public.lead_realized_value(NEW.value, NEW.net_value);

    INSERT INTO public.medical_payments (
      practice_id, company_id, appointment_id, patient_id, doctor_id,
      amount, payment_status, received_date,
      external_payment_id, payment_provider, notes
    ) VALUES (
      v_practice_id, NEW.company_id, v_appt_id, v_patient_id, NEW.medical_doctor_id,
      v_realized, 'received',
      COALESCE(NEW.payment_confirmed_at::date, NEW.closed_at::date, CURRENT_DATE),
      v_external_key, 'crm_auto',
      'Auto-gerado pelo CRM ao marcar lead como Ganho'
    )
    ON CONFLICT (external_payment_id) DO UPDATE SET
      amount         = EXCLUDED.amount,
      payment_status = 'received',
      appointment_id = COALESCE(EXCLUDED.appointment_id, public.medical_payments.appointment_id),
      doctor_id      = COALESCE(EXCLUDED.doctor_id, public.medical_payments.doctor_id),
      received_date  = EXCLUDED.received_date,
      updated_at     = now();

    RETURN NEW;

  -- Perdido -------------------------------------------------------------
  ELSIF NEW.status = 'lost' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'lost') THEN
    UPDATE public.medical_appointments
       SET status = 'cancelled', updated_at = now()
     WHERE patient_id = v_patient_id
       AND status IN ('scheduled','confirmed');

    UPDATE public.medical_payments
       SET payment_status = 'cancelled', updated_at = now()
     WHERE external_payment_id = v_external_key;

    RETURN NEW;

  -- Reabertura (won/lost -> open) --------------------------------------
  ELSIF TG_OP = 'UPDATE'
        AND OLD.status IN ('won','lost')
        AND NEW.status NOT IN ('won','lost') THEN
    UPDATE public.medical_payments
       SET payment_status = 'cancelled', updated_at = now()
     WHERE external_payment_id = v_external_key
       AND payment_provider = 'crm_auto';
  END IF;

  -- Criação automática de appointment (mesmo comportamento anterior)
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
      UPDATE public.medical_appointments SET
        doctor_id = NEW.medical_doctor_id,
        procedure_id = COALESCE(NEW.medical_procedure_id, procedure_id),
        scheduled_date = NEW.scheduled_at::timestamp,
        duration_minutes = COALESCE(NEW.duration_minutes, duration_minutes),
        status = COALESCE(NEW.appointment_status, status),
        price = COALESCE(NEW.value, price),
        payment_status = COALESCE(NEW.payment_status, payment_status),
        updated_at = now()
      WHERE id = v_existing_future;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Constraint necessária para ON CONFLICT (external_payment_id) acima
CREATE UNIQUE INDEX IF NOT EXISTS medical_payments_external_key_uniq
  ON public.medical_payments(external_payment_id)
  WHERE external_payment_id IS NOT NULL;
