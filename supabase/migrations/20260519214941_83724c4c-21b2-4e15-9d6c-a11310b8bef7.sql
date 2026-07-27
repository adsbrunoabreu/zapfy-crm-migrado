
CREATE OR REPLACE FUNCTION public.get_medical_kpis(
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
  v_period_days int;
  v_prev_from timestamptz;
  v_prev_to timestamptz;
  v_today date := CURRENT_DATE;
  v_result jsonb;

  -- current
  v_monthly_revenue numeric := 0;
  v_daily_revenue numeric := 0;
  v_total_appts int := 0;
  v_completed_appts int := 0;
  v_no_show int := 0;
  v_leads int := 0;
  v_booked int := 0;
  v_doctor_count int := 0;

  -- previous (for trend)
  v_prev_revenue numeric := 0;
  v_prev_completed int := 0;
  v_prev_no_show_rate numeric := 0;
  v_prev_conversion numeric := 0;
BEGIN
  -- Authorize: practice must belong to caller's company OR caller is master
  SELECT company_id INTO v_company_id FROM medical_practices WHERE id = p_practice_id;
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Practice not found';
  END IF;
  IF NOT (is_master() OR v_company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  v_period_days := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_to - p_from)) / 86400)::int);
  v_prev_to := p_from;
  v_prev_from := p_from - (p_to - p_from);

  -- Revenue (received in period)
  SELECT COALESCE(SUM(amount), 0) INTO v_monthly_revenue
  FROM medical_payments
  WHERE practice_id = p_practice_id
    AND payment_status = 'received'
    AND received_date >= p_from::date AND received_date <= p_to::date
    AND (p_doctor_id IS NULL OR doctor_id = p_doctor_id);

  SELECT COALESCE(SUM(amount), 0) INTO v_daily_revenue
  FROM medical_payments
  WHERE practice_id = p_practice_id
    AND payment_status = 'received'
    AND received_date = v_today
    AND (p_doctor_id IS NULL OR doctor_id = p_doctor_id);

  -- Appointments
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'no_show')
  INTO v_total_appts, v_completed_appts, v_no_show
  FROM medical_appointments
  WHERE practice_id = p_practice_id
    AND scheduled_date >= p_from AND scheduled_date <= p_to
    AND (p_doctor_id IS NULL OR doctor_id = p_doctor_id)
    AND (p_procedure_id IS NULL OR procedure_id = p_procedure_id);

  -- Marketing
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE appointment_booked = true)
  INTO v_leads, v_booked
  FROM medical_marketing
  WHERE practice_id = p_practice_id
    AND lead_received_date >= p_from::date AND lead_received_date <= p_to::date;

  -- Doctors
  SELECT COUNT(*) INTO v_doctor_count
  FROM medical_doctors
  WHERE practice_id = p_practice_id AND active = true;

  -- Previous period (for trend)
  SELECT COALESCE(SUM(amount), 0) INTO v_prev_revenue
  FROM medical_payments
  WHERE practice_id = p_practice_id
    AND payment_status = 'received'
    AND received_date >= v_prev_from::date AND received_date < v_prev_to::date
    AND (p_doctor_id IS NULL OR doctor_id = p_doctor_id);

  SELECT COUNT(*) FILTER (WHERE status = 'completed') INTO v_prev_completed
  FROM medical_appointments
  WHERE practice_id = p_practice_id
    AND scheduled_date >= v_prev_from AND scheduled_date < v_prev_to
    AND (p_doctor_id IS NULL OR doctor_id = p_doctor_id)
    AND (p_procedure_id IS NULL OR procedure_id = p_procedure_id);

  v_result := jsonb_build_object(
    'daily_revenue', v_daily_revenue,
    'monthly_revenue', v_monthly_revenue,
    'avg_ticket', CASE WHEN v_completed_appts > 0 THEN v_monthly_revenue / v_completed_appts ELSE 0 END,
    'total_appointments', v_total_appts,
    'completed_appointments', v_completed_appts,
    'no_show_count', v_no_show,
    'no_show_rate', CASE WHEN v_total_appts > 0 THEN (v_no_show::numeric / v_total_appts) * 100 ELSE 0 END,
    'leads_received', v_leads,
    'appointments_booked', v_booked,
    'conversion_rate', CASE WHEN v_leads > 0 THEN (v_booked::numeric / v_leads) * 100 ELSE 0 END,
    'doctor_count', v_doctor_count,
    'avg_occupancy_rate', 0,
    'prev_monthly_revenue', v_prev_revenue,
    'prev_completed_appointments', v_prev_completed,
    'period_days', v_period_days
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_medical_kpis(uuid, timestamptz, timestamptz, uuid, uuid) TO authenticated;
