CREATE OR REPLACE FUNCTION public.get_medical_cross_insights(
  p_practice_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_doctor_id uuid DEFAULT NULL,
  p_procedure_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_doctor_perf jsonb;
  v_procedure_mix jsonb;
  v_payment_mix jsonb;
  v_doctor_procedure jsonb;
BEGIN
  SELECT company_id INTO v_company_id
  FROM medical_practices
  WHERE id = p_practice_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Practice not found';
  END IF;

  IF NOT (is_master(auth.uid()) OR v_company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 1. Médico x Receita & Conclusão (a partir de appointments no período)
  WITH appts AS (
    SELECT a.*
    FROM medical_appointments a
    WHERE a.practice_id = p_practice_id
      AND a.scheduled_date >= p_from
      AND a.scheduled_date <  p_to
      AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR a.procedure_id = p_procedure_id)
  )
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_doctor_perf
  FROM (
    SELECT
      d.id,
      d.full_name AS name,
      COUNT(a.id)::int AS total,
      COUNT(*) FILTER (WHERE a.status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE a.status IN ('no_show','no-show'))::int AS no_shows,
      COALESCE(SUM(a.price) FILTER (WHERE a.status = 'completed'), 0)::numeric AS revenue,
      CASE WHEN COUNT(a.id) > 0
        THEN ROUND((COUNT(*) FILTER (WHERE a.status = 'completed')::numeric / COUNT(a.id)::numeric) * 100, 1)
        ELSE 0 END AS completion_pct
    FROM medical_doctors d
    LEFT JOIN appts a ON a.doctor_id = d.id
    WHERE d.practice_id = p_practice_id
      AND d.active = true
      AND (p_doctor_id IS NULL OR d.id = p_doctor_id)
    GROUP BY d.id, d.full_name
    HAVING COUNT(a.id) > 0
    ORDER BY revenue DESC, completed DESC
    LIMIT 20
  ) t;

  -- 2. Procedimento x Volume & Ticket
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_procedure_mix
  FROM (
    SELECT
      pr.id,
      pr.name,
      COUNT(a.id)::int AS volume,
      COALESCE(SUM(a.price), 0)::numeric AS revenue,
      CASE WHEN COUNT(a.id) > 0
        THEN ROUND(COALESCE(SUM(a.price),0)::numeric / COUNT(a.id)::numeric, 2)
        ELSE 0 END AS avg_ticket
    FROM medical_procedures pr
    LEFT JOIN medical_appointments a
      ON a.procedure_id = pr.id
     AND a.practice_id  = p_practice_id
     AND a.scheduled_date >= p_from
     AND a.scheduled_date <  p_to
     AND a.status = 'completed'
     AND (p_doctor_id IS NULL OR a.doctor_id = p_doctor_id)
    WHERE pr.practice_id = p_practice_id
      AND (p_procedure_id IS NULL OR pr.id = p_procedure_id)
    GROUP BY pr.id, pr.name
    HAVING COUNT(a.id) > 0
    ORDER BY revenue DESC
    LIMIT 30
  ) t;

  -- 3. Pagamento (Convênio/Particular/Cartão/Pix) x Receita & Ticket
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_payment_mix
  FROM (
    SELECT
      COALESCE(NULLIF(TRIM(mp.payment_method), ''), 'Não informado') AS method,
      COUNT(mp.id)::int AS count,
      COALESCE(SUM(mp.amount), 0)::numeric AS revenue,
      CASE WHEN COUNT(mp.id) > 0
        THEN ROUND(COALESCE(SUM(mp.amount),0)::numeric / COUNT(mp.id)::numeric, 2)
        ELSE 0 END AS avg_ticket,
      COUNT(*) FILTER (WHERE mp.payment_status = 'paid')::int AS paid_count,
      COUNT(*) FILTER (WHERE mp.payment_status = 'pending')::int AS pending_count
    FROM medical_payments mp
    LEFT JOIN medical_appointments a ON a.id = mp.appointment_id
    WHERE mp.practice_id = p_practice_id
      AND COALESCE(mp.received_date, mp.issue_date) >= p_from::date
      AND COALESCE(mp.received_date, mp.issue_date) <  p_to::date
      AND (p_doctor_id IS NULL OR mp.doctor_id = p_doctor_id OR a.doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR a.procedure_id = p_procedure_id)
    GROUP BY 1
    ORDER BY revenue DESC
  ) t;

  -- 4. Médico x Procedimento (matriz / heatmap)
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    INTO v_doctor_procedure
  FROM (
    SELECT
      d.id   AS doctor_id,
      d.full_name AS doctor_name,
      pr.id  AS procedure_id,
      pr.name AS procedure_name,
      COUNT(a.id)::int AS executions,
      COALESCE(SUM(a.price), 0)::numeric AS revenue,
      CASE WHEN COUNT(a.id) > 0
        THEN ROUND(COALESCE(SUM(a.price),0)::numeric / COUNT(a.id)::numeric, 2)
        ELSE 0 END AS avg_ticket
    FROM medical_appointments a
    JOIN medical_doctors    d  ON d.id  = a.doctor_id
    JOIN medical_procedures pr ON pr.id = a.procedure_id
    WHERE a.practice_id = p_practice_id
      AND a.scheduled_date >= p_from
      AND a.scheduled_date <  p_to
      AND a.status = 'completed'
      AND (p_doctor_id    IS NULL OR a.doctor_id    = p_doctor_id)
      AND (p_procedure_id IS NULL OR a.procedure_id = p_procedure_id)
    GROUP BY d.id, d.full_name, pr.id, pr.name
    ORDER BY executions DESC
    LIMIT 200
  ) t;

  RETURN jsonb_build_object(
    'doctor_performance', v_doctor_perf,
    'procedure_mix',      v_procedure_mix,
    'payment_mix',        v_payment_mix,
    'doctor_procedure',   v_doctor_procedure
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_medical_cross_insights(uuid, timestamptz, timestamptz, uuid, uuid) TO authenticated;