
CREATE OR REPLACE FUNCTION public.bootstrap_vault_secrets(
  _service_role_key text,
  _supabase_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  _existing_id uuid;
  _result jsonb := '{}'::jsonb;
BEGIN
  -- supabase_service_role_key
  SELECT id INTO _existing_id FROM vault.secrets WHERE name = 'supabase_service_role_key' LIMIT 1;
  IF _existing_id IS NULL THEN
    PERFORM vault.create_secret(_service_role_key, 'supabase_service_role_key',
      'Service role key usada por triggers internos (Agente IA, webhooks, etc).');
    _result := _result || jsonb_build_object('service_role_key', 'created');
  ELSE
    PERFORM vault.update_secret(_existing_id, _service_role_key);
    _result := _result || jsonb_build_object('service_role_key', 'updated');
  END IF;

  -- supabase_url
  SELECT id INTO _existing_id FROM vault.secrets WHERE name = 'supabase_url' LIMIT 1;
  IF _existing_id IS NULL THEN
    PERFORM vault.create_secret(_supabase_url, 'supabase_url',
      'URL base do projeto Supabase usada por triggers internos.');
    _result := _result || jsonb_build_object('supabase_url', 'created');
  ELSE
    PERFORM vault.update_secret(_existing_id, _supabase_url);
    _result := _result || jsonb_build_object('supabase_url', 'updated');
  END IF;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_vault_secrets(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bootstrap_vault_secrets(text, text) FROM anon, authenticated;
