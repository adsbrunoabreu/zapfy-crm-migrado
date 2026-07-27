
-- 1) RPC: séries diárias para gráficos do dashboard médico + top procedimentos + performance por médico
CREATE OR REPLACE FUNCTION public.get_medical_dashboard_series(
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
  v_daily jsonb;
  v_top_procedures jsonb;
  v_doctor_performance jsonb;
BEGIN
  -- Resolve a clínica e a empresa, validando acesso via RLS aplicada em SELECT.
  SELECT company_id INTO v_company_id
  FROM public.medical_practices
  WHERE id = p_practice_id;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Clínica não encontrada' USING ERRCODE = '42704';
  END IF;

  -- Autorização: master OU pertencente à empresa da clínica.
  IF NOT (
    public.has_role(auth.uid(), 'master')
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = v_company_id
    )
  ) THEN
    RAISE EXCEPTION 'Acesso negado à clínica' USING ERRCODE = '42501';
  END IF;

  -- Série diária: receita (medical_payments received) + agendamentos por status.
  WITH days AS (
    SELECT generate_series(
      date_trunc('day', p_from)::date,
      date_trunc('day', p_to)::date,
      interval '1 day'
    )::date AS day
  ),
  pay AS (
    SELECT
      date_trunc('day', received_date)::date AS day,
      sum(amount) AS revenue
    FROM public.medical_payments
    WHERE practice_id = p_practice_id
      AND payment_status = 'received'
      AND received_date BETWEEN p_from AND p_to
      AND (p_doctor_id IS NULL OR doctor_id = p_doctor_id)
    GROUP BY 1
  ),
  appt AS (
    SELECT
      date_trunc('day', scheduled_date)::date AS day,
      count(*) FILTER (WHERE status NOT IN ('cancelled','rescheduled')) AS total,
      count(*) FILTER (WHERE status = 'completed') AS completed,
      count(*) FILTER (WHERE status = 'no_show') AS no_show,
      count(*) FILTER (WHERE status = 'cancelled') AS cancelled
    FROM public.medical_appointments
    WHERE practice_id = p_practice_id
      AND scheduled_date BETWEEN p_from AND p_to
      AND (p_doctor_id IS NULL OR doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR procedure_id = p_procedure_id)
    GROUP BY 1
  )
  SELECT jsonb_agg(jsonb_build_object(
    'date', to_char(d.day, 'YYYY-MM-DD'),
    'revenue', COALESCE(pay.revenue, 0),
    'total', COALESCE(appt.total, 0),
    'completed', COALESCE(appt.completed, 0),
    'no_show', COALESCE(appt.no_show, 0),
    'cancelled', COALESCE(appt.cancelled, 0)
  ) ORDER BY d.day)
  INTO v_daily
  FROM days d
  LEFT JOIN pay ON pay.day = d.day
  LEFT JOIN appt ON appt.day = d.day;

  -- Top 10 procedimentos por nº de execuções concluídas no período.
  SELECT jsonb_agg(t) INTO v_top_procedures
  FROM (
    SELECT
      mp.id,
      mp.name,
      count(ma.id) AS count,
      COALESCE(sum(ma.price) FILTER (WHERE ma.status = 'completed'), 0) AS revenue
    FROM public.medical_appointments ma
    JOIN public.medical_procedures mp ON mp.id = ma.procedure_id
    WHERE ma.practice_id = p_practice_id
      AND ma.scheduled_date BETWEEN p_from AND p_to
      AND ma.status = 'completed'
      AND (p_doctor_id IS NULL OR ma.doctor_id = p_doctor_id)
      AND (p_procedure_id IS NULL OR ma.procedure_id = p_procedure_id)
    GROUP BY mp.id, mp.name
    ORDER BY count DESC
    LIMIT 10
  ) t;

  -- Performance por médico (top 10 por receita).
  SELECT jsonb_agg(t) INTO v_doctor_performance
  FROM (
    SELECT
      md.id,
      md.full_name AS name,
      count(ma.id) FILTER (WHERE ma.status = 'completed') AS appointments,
      count(ma.id) FILTER (WHERE ma.status = 'no_show') AS no_shows,
      COALESCE(sum(ma.price) FILTER (WHERE ma.status = 'completed'), 0) AS revenue
    FROM public.medical_doctors md
    LEFT JOIN public.medical_appointments ma
      ON ma.doctor_id = md.id
     AND ma.scheduled_date BETWEEN p_from AND p_to
     AND (p_procedure_id IS NULL OR ma.procedure_id = p_procedure_id)
    WHERE md.practice_id = p_practice_id
      AND md.active = true
      AND (p_doctor_id IS NULL OR md.id = p_doctor_id)
    GROUP BY md.id, md.full_name
    ORDER BY revenue DESC NULLS LAST
    LIMIT 10
  ) t;

  RETURN jsonb_build_object(
    'daily', COALESCE(v_daily, '[]'::jsonb),
    'top_procedures', COALESCE(v_top_procedures, '[]'::jsonb),
    'doctor_performance', COALESCE(v_doctor_performance, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_medical_dashboard_series(uuid, timestamptz, timestamptz, uuid, uuid) TO authenticated;

-- 2) RLS UPDATE em medical_ai_insights (dismiss / mark action_taken)
DROP POLICY IF EXISTS medical_ai_insights_update ON public.medical_ai_insights;
CREATE POLICY medical_ai_insights_update
ON public.medical_ai_insights
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'master')
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND company_id = medical_ai_insights.company_id
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'master')
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND company_id = medical_ai_insights.company_id
  )
);
