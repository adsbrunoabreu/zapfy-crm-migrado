-- 1) RLS: master pode ler/editar todas as medical_practices (já temos política por company_id)
DROP POLICY IF EXISTS medical_practices_select ON public.medical_practices;
CREATE POLICY medical_practices_select ON public.medical_practices
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'master'::app_role)
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS medical_practices_update ON public.medical_practices;
CREATE POLICY medical_practices_update ON public.medical_practices
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'master'::app_role)
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'master'::app_role)
    OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

-- 2) RPC: ativa vertical médica para uma company (cria practice idempotente)
CREATE OR REPLACE FUNCTION public.activate_medical_vertical(
  p_company_id uuid,
  p_practice_name text DEFAULT NULL,
  p_crm_type text DEFAULT 'clinic',
  p_business_model text DEFAULT 'fee-based'
)
RETURNS public.medical_practices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_practice public.medical_practices;
  v_company_name text;
  v_is_master boolean;
  v_is_admin boolean;
BEGIN
  -- Autorização: master OU admin da própria empresa
  v_is_master := public.has_role(auth.uid(), 'master'::app_role);
  v_is_admin := EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND company_id = p_company_id
  ) AND public.has_role(auth.uid(), 'company_admin'::app_role);

  IF NOT (v_is_master OR v_is_admin) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Vertical na company
  UPDATE public.companies SET crm_vertical = 'medical' WHERE id = p_company_id
  RETURNING name INTO v_company_name;

  IF v_company_name IS NULL THEN
    RAISE EXCEPTION 'company_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Practice idempotente (1 por company)
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
$$;

REVOKE ALL ON FUNCTION public.activate_medical_vertical(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activate_medical_vertical(uuid, text, text, text) TO authenticated;

-- 3) RPC: master-only para mudar vertical (ida e volta)
CREATE OR REPLACE FUNCTION public.set_company_vertical(
  p_company_id uuid,
  p_vertical text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'master'::app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_vertical NOT IN ('standard', 'medical') THEN
    RAISE EXCEPTION 'invalid_vertical' USING ERRCODE = '22023';
  END IF;

  UPDATE public.companies SET crm_vertical = p_vertical WHERE id = p_company_id;

  -- Se virou medical, garante a practice
  IF p_vertical = 'medical' THEN
    PERFORM public.activate_medical_vertical(p_company_id, NULL, 'clinic', 'fee-based');
  END IF;

  RETURN p_vertical;
END;
$$;

REVOKE ALL ON FUNCTION public.set_company_vertical(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_company_vertical(uuid, text) TO authenticated;