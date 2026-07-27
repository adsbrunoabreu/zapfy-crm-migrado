
DO $$
DECLARE _exists boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'webhook_secret_key') INTO _exists;
  IF NOT _exists THEN
    PERFORM vault.create_secret(
      encode(gen_random_bytes(32), 'base64'),
      'webhook_secret_key',
      'AES key used to encrypt webhook signing secrets at rest'
    );
  END IF;
END $$;

ALTER TABLE public.webhooks ADD COLUMN IF NOT EXISTS secret_encrypted bytea;

CREATE OR REPLACE FUNCTION public._webhook_enc_key()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, vault AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'webhook_secret_key' LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public._webhook_enc_key() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._mask_webhook_secret(_plain text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT 'whsec_' || repeat('*', 12) || right(_plain, 4);
$$;

CREATE OR REPLACE FUNCTION public.set_webhook_secret(_webhook_id uuid, _plaintext text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault AS $$
DECLARE _company uuid; _key text;
BEGIN
  IF _plaintext IS NULL OR length(_plaintext) < 16 THEN
    RAISE EXCEPTION 'O segredo deve ter ao menos 16 caracteres';
  END IF;
  SELECT company_id INTO _company FROM public.webhooks WHERE id = _webhook_id;
  IF _company IS NULL THEN RAISE EXCEPTION 'Webhook não encontrado'; END IF;
  IF NOT (_company = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Sem permissão para alterar este webhook';
  END IF;
  _key := public._webhook_enc_key();
  UPDATE public.webhooks
     SET secret_encrypted = pgp_sym_encrypt(_plaintext, _key),
         secret = public._mask_webhook_secret(_plaintext),
         updated_at = now()
   WHERE id = _webhook_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_webhook_secret(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_webhook_secret(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_webhook_secret_plaintext(_webhook_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault AS $$
DECLARE _enc bytea; _key text;
BEGIN
  SELECT secret_encrypted INTO _enc FROM public.webhooks WHERE id = _webhook_id;
  IF _enc IS NULL THEN RETURN NULL; END IF;
  _key := public._webhook_enc_key();
  RETURN pgp_sym_decrypt(_enc, _key);
END $$;
REVOKE EXECUTE ON FUNCTION public.get_webhook_secret_plaintext(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_fn_webhook_secret_protect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, vault AS $$
DECLARE _key text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.secret IS NOT NULL AND NEW.secret_encrypted IS NULL THEN
      IF length(NEW.secret) < 16 THEN RAISE EXCEPTION 'O segredo deve ter ao menos 16 caracteres'; END IF;
      _key := public._webhook_enc_key();
      NEW.secret_encrypted := pgp_sym_encrypt(NEW.secret, _key);
      NEW.secret := public._mask_webhook_secret(NEW.secret);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.secret IS DISTINCT FROM OLD.secret AND NEW.secret NOT LIKE 'whsec_%' THEN
      IF length(NEW.secret) < 16 THEN RAISE EXCEPTION 'O segredo deve ter ao menos 16 caracteres'; END IF;
      _key := public._webhook_enc_key();
      NEW.secret_encrypted := pgp_sym_encrypt(NEW.secret, _key);
      NEW.secret := public._mask_webhook_secret(NEW.secret);
    ELSIF NEW.secret IS DISTINCT FROM OLD.secret AND NEW.secret LIKE 'whsec_%' THEN
      NEW.secret := OLD.secret;
      NEW.secret_encrypted := OLD.secret_encrypted;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_webhook_secret_protect ON public.webhooks;
CREATE TRIGGER trg_webhook_secret_protect
  BEFORE INSERT OR UPDATE ON public.webhooks
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_webhook_secret_protect();

DO $$
DECLARE r RECORD; k text;
BEGIN
  k := public._webhook_enc_key();
  FOR r IN SELECT id, secret FROM public.webhooks WHERE secret_encrypted IS NULL AND secret IS NOT NULL LOOP
    UPDATE public.webhooks
       SET secret_encrypted = pgp_sym_encrypt(r.secret, k),
           secret = public._mask_webhook_secret(r.secret)
     WHERE id = r.id;
  END LOOP;
END $$;
