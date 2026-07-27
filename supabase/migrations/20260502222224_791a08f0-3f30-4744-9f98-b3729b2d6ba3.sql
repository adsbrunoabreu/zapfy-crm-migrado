CREATE OR REPLACE FUNCTION public.exec_admin_sql(sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Only service_role may execute this function
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden: service role required';
  END IF;
  EXECUTE 'SELECT COALESCE(jsonb_agg(t), ''[]''::jsonb) FROM (' || sql || ') t' INTO result;
  RETURN result;
EXCEPTION WHEN others THEN
  -- For DDL statements (no rows returned), execute and return empty array
  EXECUTE sql;
  RETURN '[]'::jsonb;
END;
$$;

REVOKE ALL ON FUNCTION public.exec_admin_sql(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.exec_admin_sql(text) TO service_role;