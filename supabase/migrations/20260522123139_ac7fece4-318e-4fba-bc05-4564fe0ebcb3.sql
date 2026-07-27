
-- 1. Helper: BR-aware phone match key
CREATE OR REPLACE FUNCTION public.br_phone_match_key(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  d text;
BEGIN
  d := regexp_replace(COALESCE(p,''), '[^0-9]', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  -- BR mobile pattern: 55 + DDD(2) + 9 + 8 digits = 13 chars, 5th char is '9'
  IF length(d) = 13 AND substring(d, 1, 2) = '55' AND substring(d, 5, 1) = '9' THEN
    RETURN substring(d, 1, 4) || substring(d, 6);
  END IF;
  RETURN d;
END $$;

-- 2. Add phone_match_key to contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone_match_key text;

-- Update normalize/update triggers to also fill phone_match_key
CREATE OR REPLACE FUNCTION public.set_contact_tenant_seq()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_seq integer;
BEGIN
  IF NEW.tenant_seq IS NULL AND NEW.company_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('contacts_seq_' || NEW.company_id::text));
    SELECT COALESCE(MAX(tenant_seq), 0) + 1 INTO next_seq
    FROM public.contacts WHERE company_id = NEW.company_id;
    NEW.tenant_seq := next_seq;
  END IF;
  NEW.phone_normalized := public.contacts_normalize_phone(NEW.phone);
  NEW.phone_match_key := public.br_phone_match_key(NEW.phone);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.contacts_before_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_normalized := public.contacts_normalize_phone(NEW.phone);
    NEW.phone_match_key := public.br_phone_match_key(NEW.phone);
  END IF;
  RETURN NEW;
END $$;

-- Backfill phone_match_key for existing contacts
UPDATE public.contacts
   SET phone_match_key = public.br_phone_match_key(phone)
 WHERE phone IS NOT NULL AND phone_match_key IS NULL;

-- Index (non-unique to avoid breaking on legacy dupes)
CREATE INDEX IF NOT EXISTS idx_contacts_phone_match_key
  ON public.contacts(company_id, phone_match_key)
  WHERE phone_match_key IS NOT NULL;

-- 3. Auto-link trigger on conversations
CREATE OR REPLACE FUNCTION public.conversations_link_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text;
BEGIN
  IF NEW.contact_id IS NULL AND NEW.phone IS NOT NULL THEN
    v_key := public.br_phone_match_key(NEW.phone);
    IF v_key IS NOT NULL THEN
      SELECT id INTO NEW.contact_id
        FROM public.contacts
       WHERE company_id = NEW.company_id
         AND phone_match_key = v_key
       ORDER BY created_at ASC
       LIMIT 1;
    END IF;
  END IF;

  IF NEW.contact_id IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT contact_id INTO NEW.contact_id
      FROM public.leads WHERE id = NEW.lead_id;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_conversations_link_contact ON public.conversations;
CREATE TRIGGER trg_conversations_link_contact
BEFORE INSERT OR UPDATE OF phone, lead_id, contact_id
ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.conversations_link_contact();

-- 4. Backfill: link existing conversations by phone match key
UPDATE public.conversations cv
   SET contact_id = c.id
  FROM public.contacts c
 WHERE cv.contact_id IS NULL
   AND cv.phone IS NOT NULL
   AND c.company_id = cv.company_id
   AND c.phone_match_key IS NOT NULL
   AND c.phone_match_key = public.br_phone_match_key(cv.phone);
