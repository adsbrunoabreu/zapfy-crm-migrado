CREATE OR REPLACE FUNCTION public.log_instance_sync(
  _instance_name TEXT,
  _phone TEXT,
  _success BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id UUID;
BEGIN
  _company_id := public.get_user_company_id(auth.uid());
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'No company';
  END IF;

  INSERT INTO public.system_logs (
    company_id, source, level, event, message, instance_name, metadata
  ) VALUES (
    _company_id,
    'connections-ui',
    CASE WHEN _success THEN 'info' ELSE 'warn' END,
    'instance_sync',
    CASE
      WHEN _success AND _phone IS NOT NULL
        THEN 'Sincronização manual: telefone ' || _phone || ' vinculado'
      WHEN _success
        THEN 'Sincronização manual: instância conectada (telefone não disponível na Evolution)'
      ELSE 'Sincronização manual: instância desconectada na Evolution'
    END,
    _instance_name,
    jsonb_build_object('phone', _phone, 'success', _success, 'triggered_by', auth.uid())
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_instance_sync(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_instance_sync(TEXT, TEXT, BOOLEAN) TO authenticated;