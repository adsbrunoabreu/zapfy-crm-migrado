CREATE OR REPLACE FUNCTION public._debug_scope() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_master boolean := public.has_role(_caller, 'master'::app_role);
  _company uuid;
  _cnt int;
BEGIN
  SELECT company_id INTO _company FROM public.profiles WHERE id = _caller;
  SELECT count(*) INTO _cnt FROM public.leads WHERE company_id = _company;
  RETURN jsonb_build_object('caller', _caller, 'is_master', _is_master, 'company', _company, 'leads_count', _cnt);
END $$;