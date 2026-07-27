-- 1) Schema: adicionar FKs de convênio e hospital nas consultas médicas
ALTER TABLE public.medical_appointments
  ADD COLUMN IF NOT EXISTS insurance_id uuid REFERENCES public.medical_insurances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS facility_id  uuid REFERENCES public.medical_facilities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_medical_appointments_insurance ON public.medical_appointments(insurance_id);
CREATE INDEX IF NOT EXISTS idx_medical_appointments_facility  ON public.medical_appointments(facility_id);

-- 2) Trigger: sempre criar/atualizar appointment ao marcar lead como Ganho
CREATE OR REPLACE FUNCTION public.sync_lead_to_medical()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vertical text;
  v_practice_id uuid;
  v_patient_id uuid;
  v_existing_future uuid;
  v_appt_id uuid;
  v_cpf varchar(20);
  v_realized numeric;
  v_external_key varchar(50);
  v_appt_date timestamp;
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

  -- Ganho
  IF NEW.status = 'won' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'won') THEN
    -- Conclui consultas futuras já agendadas para o paciente
    UPDATE public.medical_appointments
       SET status = 'completed', payment_status = 'paid',
           doctor_id    = COALESCE(NEW.medical_doctor_id, doctor_id),
           procedure_id = COALESCE(NEW.medical_procedure_id, procedure_id),
           insurance_id = COALESCE(NEW.insurance_id, insurance_id),
           facility_id  = COALESCE(NEW.facility_id, facility_id),
           updated_at = now()
     WHERE patient_id = v_patient_id
       AND status IN ('scheduled','confirmed')
       AND scheduled_date >= now() - interval '1 day';

    -- Procura appointment já vinculado a este lead
    SELECT id INTO v_appt_id FROM public.medical_appointments
      WHERE lead_id = NEW.id ORDER BY scheduled_date DESC LIMIT 1;

    -- Se não houver appointment, cria um retroativo (lead foi ganho sem agendamento)
    IF v_appt_id IS NULL THEN
      v_appt_date := COALESCE(
        NEW.scheduled_at::timestamp,
        NEW.payment_confirmed_at::timestamp,
        NEW.closed_at::timestamp,
        now()::timestamp
      );

      INSERT INTO public.medical_appointments (
        practice_id, company_id, doctor_id, patient_id, procedure_id,
        insurance_id, facility_id,
        scheduled_date, duration_minutes, status, price, payment_status,
        source, lead_id
      ) VALUES (
        v_practice_id, NEW.company_id, NEW.medical_doctor_id, v_patient_id,
        NEW.medical_procedure_id,
        NEW.insurance_id, NEW.facility_id,
        v_appt_date,
        COALESCE(NEW.duration_minutes, 30),
        'completed',
        COALESCE(NEW.net_value, NEW.value),
        'paid',
        NEW.source,
        NEW.id
      )
      RETURNING id INTO v_appt_id;
    ELSE
      -- Garante que o appointment vinculado reflete o estado de ganho
      UPDATE public.medical_appointments SET
        status = 'completed',
        payment_status = 'paid',
        doctor_id    = COALESCE(NEW.medical_doctor_id, doctor_id),
        procedure_id = COALESCE(NEW.medical_procedure_id, procedure_id),
        insurance_id = COALESCE(NEW.insurance_id, insurance_id),
        facility_id  = COALESCE(NEW.facility_id, facility_id),
        price        = COALESCE(NEW.net_value, NEW.value, price),
        updated_at   = now()
      WHERE id = v_appt_id;
    END IF;

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
    ON CONFLICT (external_payment_id) WHERE external_payment_id IS NOT NULL DO UPDATE SET
      amount         = EXCLUDED.amount,
      payment_status = 'received',
      appointment_id = COALESCE(EXCLUDED.appointment_id, public.medical_payments.appointment_id),
      doctor_id      = COALESCE(EXCLUDED.doctor_id, public.medical_payments.doctor_id),
      received_date  = EXCLUDED.received_date,
      updated_at     = now();

    RETURN NEW;

  -- Perdido
  ELSIF NEW.status = 'lost' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'lost') THEN
    UPDATE public.medical_appointments
       SET status = 'cancelled', updated_at = now()
     WHERE patient_id = v_patient_id
       AND status IN ('scheduled','confirmed');

    UPDATE public.medical_payments
       SET payment_status = 'cancelled', updated_at = now()
     WHERE external_payment_id = v_external_key;

    RETURN NEW;

  -- Reabertura (won/lost -> open)
  ELSIF TG_OP = 'UPDATE'
        AND OLD.status IN ('won','lost')
        AND NEW.status NOT IN ('won','lost') THEN
    UPDATE public.medical_payments
       SET payment_status = 'cancelled', updated_at = now()
     WHERE external_payment_id = v_external_key
       AND payment_provider = 'crm_auto';
  END IF;

  -- Fluxo normal de agendamento (lead aberto com scheduled_at preenchido)
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
        insurance_id, facility_id,
        scheduled_date, duration_minutes, status, price, payment_status,
        source, lead_id
      ) VALUES (
        v_practice_id, NEW.company_id, NEW.medical_doctor_id, v_patient_id,
        NEW.medical_procedure_id,
        NEW.insurance_id, NEW.facility_id,
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
        doctor_id    = NEW.medical_doctor_id,
        procedure_id = COALESCE(NEW.medical_procedure_id, procedure_id),
        insurance_id = COALESCE(NEW.insurance_id, insurance_id),
        facility_id  = COALESCE(NEW.facility_id, facility_id),
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

-- 3) RPC de gráficos: convênios e hospitais por FK real
CREATE OR REPLACE FUNCTION public.get_medical_pie_breakdowns(
  p_practice_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL,
  p_doctor_id uuid DEFAULT NULL,
  p_procedure_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_from timestamptz := COALESCE(p_from, now() - interval '30 days');
  v_to timestamptz := COALESCE(p_to, now());
  v_procedures jsonb;
  v_doctors jsonb;
  v_insurances jsonb;
  v_hospitals jsonb;
BEGIN
  SELECT company_id INTO v_company FROM medical_practices WHERE id = p_practice_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Practice not found';
  END IF;
  IF NOT (is_master(auth.uid())
          OR v_company IN (SELECT company_id FROM profiles WHERE id = auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', count) ORDER BY count DESC), '[]'::jsonb)
  INTO v_procedures
  FROM (
    SELECT COALESCE(pr.name,'Sem procedimento') AS name, COUNT(*)::int AS count
    FROM medical_appointments a
    LEFT JOIN medical_procedures pr ON pr.id = a.procedure_id
    WHERE a.practice_id = p_practice_id
      AND a.scheduled_date >= v_from AND a.scheduled_date <= v_to
      AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR a.procedure_id = p_procedure_id)
    GROUP BY 1
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', count) ORDER BY count DESC), '[]'::jsonb)
  INTO v_doctors
  FROM (
    SELECT COALESCE(d.full_name,'Sem médico') AS name, COUNT(*)::int AS count
    FROM medical_appointments a
    LEFT JOIN medical_doctors d ON d.id = a.doctor_id
    WHERE a.practice_id = p_practice_id
      AND a.scheduled_date >= v_from AND a.scheduled_date <= v_to
      AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR a.procedure_id = p_procedure_id)
    GROUP BY 1
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', count) ORDER BY count DESC), '[]'::jsonb)
  INTO v_insurances
  FROM (
    SELECT COALESCE(i.name, 'Particular') AS name, COUNT(*)::int AS count
    FROM medical_appointments a
    LEFT JOIN medical_insurances i ON i.id = a.insurance_id
    WHERE a.practice_id = p_practice_id
      AND a.scheduled_date >= v_from AND a.scheduled_date <= v_to
      AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR a.procedure_id = p_procedure_id)
    GROUP BY 1
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', count) ORDER BY count DESC), '[]'::jsonb)
  INTO v_hospitals
  FROM (
    SELECT COALESCE(f.name, 'Não informado') AS name, COUNT(*)::int AS count
    FROM medical_appointments a
    LEFT JOIN medical_facilities f ON f.id = a.facility_id
    WHERE a.practice_id = p_practice_id
      AND a.scheduled_date >= v_from AND a.scheduled_date <= v_to
      AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR a.procedure_id = p_procedure_id)
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'procedures', v_procedures,
    'doctors', v_doctors,
    'insurances', v_insurances,
    'hospitals', v_hospitals
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_medical_pie_breakdowns(uuid, timestamptz, timestamptz, uuid, uuid) TO authenticated;

-- 4) Backfill: leads ganhos sem appointment vinculado
DO $$
DECLARE
  r RECORD;
  v_practice uuid;
  v_appt uuid;
BEGIN
  FOR r IN
    SELECT l.*
    FROM public.leads l
    JOIN public.companies c ON c.id = l.company_id AND c.crm_vertical = 'medical'
    LEFT JOIN public.medical_appointments a ON a.lead_id = l.id
    WHERE l.status = 'won'
      AND l.medical_patient_id IS NOT NULL
      AND a.id IS NULL
  LOOP
    SELECT id INTO v_practice FROM public.medical_practices
      WHERE company_id = r.company_id ORDER BY created_at ASC LIMIT 1;
    IF v_practice IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.medical_appointments (
      practice_id, company_id, doctor_id, patient_id, procedure_id,
      insurance_id, facility_id,
      scheduled_date, duration_minutes, status, price, payment_status,
      source, lead_id
    ) VALUES (
      v_practice, r.company_id, r.medical_doctor_id, r.medical_patient_id,
      r.medical_procedure_id, r.insurance_id, r.facility_id,
      COALESCE(r.scheduled_at::timestamp, r.payment_confirmed_at::timestamp, r.closed_at::timestamp, now()::timestamp),
      COALESCE(r.duration_minutes, 30),
      'completed',
      COALESCE(r.net_value, r.value),
      'paid',
      r.source,
      r.id
    )
    RETURNING id INTO v_appt;

    -- Vincular payment auto ao appointment recém-criado
    UPDATE public.medical_payments
       SET appointment_id = v_appt, updated_at = now()
     WHERE external_payment_id = 'lead:' || r.id::text
       AND appointment_id IS NULL;
  END LOOP;
END $$;