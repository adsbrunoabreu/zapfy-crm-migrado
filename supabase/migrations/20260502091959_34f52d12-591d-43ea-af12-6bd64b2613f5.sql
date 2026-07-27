
DO $$
DECLARE
  _url text;
  _key text;
  _existing_id uuid;
BEGIN
  -- Tenta obter da configuração Postgres (Supabase injeta esses valores)
  BEGIN _url := current_setting('app.settings.supabase_url', true); EXCEPTION WHEN OTHERS THEN _url := NULL; END;
  IF _url IS NULL OR _url = '' THEN
    BEGIN _url := current_setting('supabase.url', true); EXCEPTION WHEN OTHERS THEN _url := NULL; END;
  END IF;
  IF _url IS NULL OR _url = '' THEN
    _url := 'https://bupzemhjqzjlbsgmcdti.supabase.co';
  END IF;

  BEGIN _key := current_setting('app.settings.service_role_key', true); EXCEPTION WHEN OTHERS THEN _key := NULL; END;
  IF _key IS NULL OR _key = '' THEN
    BEGIN _key := current_setting('supabase.service_role_key', true); EXCEPTION WHEN OTHERS THEN _key := NULL; END;
  END IF;

  -- Sempre garante supabase_url
  SELECT id INTO _existing_id FROM vault.secrets WHERE name = 'supabase_url' LIMIT 1;
  IF _existing_id IS NULL THEN
    PERFORM vault.create_secret(_url, 'supabase_url', 'Project base URL');
  ELSE
    PERFORM vault.update_secret(_existing_id, _url);
  END IF;

  IF _key IS NOT NULL AND _key <> '' THEN
    SELECT id INTO _existing_id FROM vault.secrets WHERE name = 'supabase_service_role_key' LIMIT 1;
    IF _existing_id IS NULL THEN
      PERFORM vault.create_secret(_key, 'supabase_service_role_key', 'Service role key for internal triggers');
    ELSE
      PERFORM vault.update_secret(_existing_id, _key);
    END IF;
    RAISE NOTICE 'Vault populado: supabase_url + supabase_service_role_key';
  ELSE
    RAISE WARNING 'service_role_key não disponível via current_setting; será necessário usar a tela Integrações > Alertas > Sincronizar segredos internos';
  END IF;
END $$;
