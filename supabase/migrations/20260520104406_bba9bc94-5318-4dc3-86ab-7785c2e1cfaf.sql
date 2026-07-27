
-- Seed hospitals via appointments.source for demo practice
UPDATE public.medical_appointments
SET source = (ARRAY['Hospital São Lucas','Hospital Santa Maria','Clínica Própria','Hospital Vida Nova','Hospital Albert'])[1 + floor(random()*5)::int]
WHERE practice_id = 'e9ebf127-1aef-4ce6-9b5c-b0c953ca6013';

-- RPC: returns 4 breakdowns for pie charts
CREATE OR REPLACE FUNCTION public.get_medical_pie_breakdowns(
  p_practice_id uuid,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_doctor_id uuid DEFAULT NULL,
  p_procedure_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    RETURN jsonb_build_object('procedures','[]'::jsonb,'doctors','[]'::jsonb,'insurances','[]'::jsonb,'hospitals','[]'::jsonb);
  END IF;
  IF NOT (is_master() OR has_company_access(v_company)) THEN
    RAISE EXCEPTION 'forbidden';
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
    SELECT
      CASE
        WHEN p.payment_method ILIKE 'Convênio %' THEN regexp_replace(p.payment_method, '^Convênio\s+', '')
        WHEN p.payment_method IS NULL OR p.payment_method = '' THEN 'Não informado'
        ELSE p.payment_method
      END AS name,
      COUNT(*)::int AS count
    FROM medical_payments p
    LEFT JOIN medical_appointments a ON a.id = p.appointment_id
    WHERE p.practice_id = p_practice_id
      AND COALESCE(p.received_date, p.issue_date, p.created_at) >= v_from
      AND COALESCE(p.received_date, p.issue_date, p.created_at) <= v_to
      AND (p_doctor_id IS NULL OR p.doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR a.procedure_id = p_procedure_id)
    GROUP BY 1
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', count) ORDER BY count DESC), '[]'::jsonb)
  INTO v_hospitals
  FROM (
    SELECT COALESCE(NULLIF(a.source,''),'Não informado') AS name, COUNT(*)::int AS count
    FROM medical_appointments a
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
$$;

GRANT EXECUTE ON FUNCTION public.get_medical_pie_breakdowns(uuid, timestamptz, timestamptz, uuid, uuid) TO authenticated;
