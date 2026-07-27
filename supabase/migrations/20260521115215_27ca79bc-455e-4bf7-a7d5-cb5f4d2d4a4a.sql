
CREATE OR REPLACE FUNCTION public.activate_medical_vertical(
  p_company_id uuid,
  p_practice_name text DEFAULT NULL::text,
  p_crm_type text DEFAULT 'clinic'::text,
  p_business_model text DEFAULT 'fee-based'::text
)
RETURNS medical_practices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_practice public.medical_practices;
  v_company_name text;
  v_is_master boolean;
  v_is_admin boolean;
BEGIN
  v_is_master := public.has_role(auth.uid(), 'master'::app_role);
  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND company_id = p_company_id
  ) AND public.has_role(auth.uid(), 'admin'::app_role);

  IF NOT (v_is_master OR v_is_admin) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.companies SET crm_vertical = 'medical' WHERE id = p_company_id
  RETURNING name INTO v_company_name;

  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'company_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_practice FROM public.medical_practices WHERE company_id = p_company_id LIMIT 1;
  IF v_practice.id IS NULL THEN
    INSERT INTO public.medical_practices (
      company_id, practice_name, crm_type, business_model,
      whatsapp_integration_enabled, appointment_reminders_enabled
    )
    VALUES (
      p_company_id,
      COALESCE(NULLIF(p_practice_name, ''), v_company_name),
      p_crm_type,
      p_business_model,
      true,
      true
    )
    RETURNING * INTO v_practice;
  END IF;

  RETURN v_practice;
END;
$function$;
