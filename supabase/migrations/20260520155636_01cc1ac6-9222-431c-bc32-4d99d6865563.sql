
-- 1. TABLE
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tenant_seq integer,
  name text NOT NULL,
  phone text,
  phone_normalized text,
  email text,
  document text,
  birth_date date,
  gender varchar(20),
  avatar_url text,
  company_name text,
  source text,
  notes text,
  country text,
  zip_code text,
  address text,
  address_number text,
  address_complement text,
  neighborhood text,
  city text,
  state text,
  medical_patient_id uuid,
  allergies text,
  insurance text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_interaction_at timestamptz,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_company ON public.contacts(company_id);
CREATE INDEX idx_contacts_company_name ON public.contacts(company_id, name);
CREATE INDEX idx_contacts_assigned ON public.contacts(assigned_to);
CREATE INDEX idx_contacts_phone_norm ON public.contacts(company_id, phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE INDEX idx_contacts_document ON public.contacts(company_id, document) WHERE document IS NOT NULL;
CREATE UNIQUE INDEX uq_contacts_company_phone_norm ON public.contacts(company_id, phone_normalized) WHERE phone_normalized IS NOT NULL;
CREATE UNIQUE INDEX uq_contacts_company_document ON public.contacts(company_id, document) WHERE document IS NOT NULL AND length(document) > 0;
CREATE UNIQUE INDEX uq_contacts_company_seq ON public.contacts(company_id, tenant_seq) WHERE tenant_seq IS NOT NULL;

-- 2. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.contacts_normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(regexp_replace(COALESCE(p,''), '[^0-9]', '', 'g'), '')
$$;

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
  RETURN NEW;
END $$;

CREATE TRIGGER trg_set_contact_tenant_seq
BEFORE INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.set_contact_tenant_seq();

CREATE OR REPLACE FUNCTION public.contacts_before_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.phone_normalized := public.contacts_normalize_phone(NEW.phone);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_contacts_before_update
BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.contacts_before_update();

-- 3. RLS
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master can do everything on contacts"
ON public.contacts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'master'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "Users can view their company contacts"
ON public.contacts FOR SELECT TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id));

CREATE POLICY "Users can insert contacts in their company"
ON public.contacts FOR INSERT TO authenticated
WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id));

CREATE POLICY "Users can update their company contacts"
ON public.contacts FOR UPDATE TO authenticated
USING (company_id = public.get_user_company_id(auth.uid()))
WITH CHECK (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id));

CREATE POLICY "Admins can delete contacts"
ON public.contacts FOR DELETE TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'master'::app_role))
);

-- 4. FK COLUMNS ON RELATED TABLES
ALTER TABLE public.leads ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_leads_contact ON public.leads(contact_id);

ALTER TABLE public.conversations ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_conversations_contact ON public.conversations(contact_id);

ALTER TABLE public.appointments ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_appointments_contact ON public.appointments(contact_id);

ALTER TABLE public.lead_attachments ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_lead_attachments_contact ON public.lead_attachments(contact_id);

ALTER TABLE public.lead_activities ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_lead_activities_contact ON public.lead_activities(contact_id);

-- 5. SYNC TRIGGER FROM LEADS TO CONTACTS
CREATE OR REPLACE FUNCTION public.sync_lead_to_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone_norm text;
  v_doc text;
  v_contact_id uuid;
BEGIN
  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;
  v_phone_norm := public.contacts_normalize_phone(NEW.phone);
  v_doc := NULLIF(regexp_replace(COALESCE(NEW.document,''), '[^0-9]', '', 'g'), '');

  IF v_phone_norm IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM public.contacts
      WHERE company_id = NEW.company_id AND phone_normalized = v_phone_norm LIMIT 1;
  END IF;
  IF v_contact_id IS NULL AND v_doc IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM public.contacts
      WHERE company_id = NEW.company_id AND document = v_doc LIMIT 1;
  END IF;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (
      company_id, name, phone, email, document, avatar_url, company_name, source,
      birth_date, gender, country, zip_code, address, address_number,
      address_complement, neighborhood, city, state, allergies, insurance,
      assigned_to, created_by, is_demo, last_interaction_at, notes
    ) VALUES (
      NEW.company_id, NEW.name, NEW.phone, NEW.email, v_doc, NEW.avatar_url,
      NEW.company_name, NEW.source, NEW.birth_date, NEW.gender, NEW.country,
      NEW.zip_code, NEW.address, NEW.address_number, NEW.address_complement,
      NEW.neighborhood, NEW.city, NEW.state, NEW.allergies, NEW.insurance,
      NEW.assigned_to, NEW.created_by, COALESCE(NEW.is_demo, false),
      COALESCE(NEW.created_at, now()), NEW.notes
    )
    RETURNING id INTO v_contact_id;
  ELSE
    UPDATE public.contacts SET
      email = COALESCE(email, NEW.email),
      document = COALESCE(document, v_doc),
      avatar_url = COALESCE(avatar_url, NEW.avatar_url),
      company_name = COALESCE(company_name, NEW.company_name),
      source = COALESCE(source, NEW.source),
      birth_date = COALESCE(birth_date, NEW.birth_date),
      gender = COALESCE(gender, NEW.gender),
      country = COALESCE(country, NEW.country),
      zip_code = COALESCE(zip_code, NEW.zip_code),
      address = COALESCE(address, NEW.address),
      address_number = COALESCE(address_number, NEW.address_number),
      address_complement = COALESCE(address_complement, NEW.address_complement),
      neighborhood = COALESCE(neighborhood, NEW.neighborhood),
      city = COALESCE(city, NEW.city),
      state = COALESCE(state, NEW.state),
      allergies = COALESCE(allergies, NEW.allergies),
      insurance = COALESCE(insurance, NEW.insurance),
      assigned_to = COALESCE(assigned_to, NEW.assigned_to),
      last_interaction_at = now()
    WHERE id = v_contact_id;
  END IF;

  NEW.contact_id := v_contact_id;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_sync_lead_to_contact
BEFORE INSERT OR UPDATE OF phone, document, name, email ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.sync_lead_to_contact();

-- 6. MERGE RPC
CREATE OR REPLACE FUNCTION public.merge_contacts(primary_id uuid, duplicate_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_company uuid;
BEGIN
  IF primary_id = duplicate_id THEN RETURN; END IF;
  SELECT company_id INTO v_company FROM public.contacts WHERE id = primary_id;
  IF v_company IS NULL THEN RAISE EXCEPTION 'Primary contact not found'; END IF;
  IF NOT (public.has_role(auth.uid(), 'master'::app_role) OR v_company = public.get_user_company_id(auth.uid())) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.leads SET contact_id = primary_id WHERE contact_id = duplicate_id;
  UPDATE public.conversations SET contact_id = primary_id WHERE contact_id = duplicate_id;
  UPDATE public.appointments SET contact_id = primary_id WHERE contact_id = duplicate_id;
  UPDATE public.lead_attachments SET contact_id = primary_id WHERE contact_id = duplicate_id;
  UPDATE public.lead_activities SET contact_id = primary_id WHERE contact_id = duplicate_id;
  DELETE FROM public.contacts WHERE id = duplicate_id AND company_id = v_company;
END $$;

-- 7. BACKFILL - create contacts from existing leads
INSERT INTO public.contacts (
  company_id, name, phone, email, document, avatar_url, company_name, source,
  birth_date, gender, country, zip_code, address, address_number,
  address_complement, neighborhood, city, state, allergies, insurance,
  assigned_to, created_by, is_demo, last_interaction_at, notes, created_at
)
SELECT
  company_id, name, phone, email, doc_norm, avatar_url, company_name, source,
  birth_date, gender, country, zip_code, address, address_number,
  address_complement, neighborhood, city, state, allergies, insurance,
  assigned_to, created_by, COALESCE(is_demo, false), created_at, notes, created_at
FROM (
  SELECT
    l.id AS lead_id, l.company_id,
    NULLIF(regexp_replace(COALESCE(l.document,''), '[^0-9]', '', 'g'), '') AS doc_norm,
    l.name, l.phone, l.email, l.avatar_url, l.company_name, l.source,
    l.birth_date, l.gender, l.country, l.zip_code, l.address, l.address_number,
    l.address_complement, l.neighborhood, l.city, l.state, l.allergies, l.insurance,
    l.assigned_to, l.created_by, l.is_demo, l.created_at, l.notes,
    ROW_NUMBER() OVER (
      PARTITION BY l.company_id, COALESCE(
        public.contacts_normalize_phone(l.phone),
        'doc:' || COALESCE(NULLIF(regexp_replace(COALESCE(l.document,''), '[^0-9]', '', 'g'), ''), 'lead:' || l.id::text)
      )
      ORDER BY l.created_at ASC
    ) AS rn
  FROM public.leads l
) ranked
WHERE rn = 1
ON CONFLICT DO NOTHING;

-- 8. LINK leads to contacts (disable blocking triggers during backfill)
ALTER TABLE public.leads DISABLE TRIGGER trg_prevent_closed_lead_edits;
ALTER TABLE public.leads DISABLE TRIGGER trg_lead_history_lead_update;
ALTER TABLE public.leads DISABLE TRIGGER trg_n8n_lead_updated;
ALTER TABLE public.leads DISABLE TRIGGER trg_webhook_lead_updated;
ALTER TABLE public.leads DISABLE TRIGGER trg_sync_lead_to_medical;
ALTER TABLE public.leads DISABLE TRIGGER trg_sync_lead_to_contact;

UPDATE public.leads l SET contact_id = c.id
FROM public.contacts c
WHERE l.company_id = c.company_id
  AND c.phone_normalized IS NOT NULL
  AND c.phone_normalized = public.contacts_normalize_phone(l.phone)
  AND l.contact_id IS NULL;

UPDATE public.leads l SET contact_id = c.id
FROM public.contacts c
WHERE l.contact_id IS NULL
  AND l.company_id = c.company_id
  AND c.document IS NOT NULL
  AND c.document = NULLIF(regexp_replace(COALESCE(l.document,''), '[^0-9]', '', 'g'), '');

ALTER TABLE public.leads ENABLE TRIGGER trg_prevent_closed_lead_edits;
ALTER TABLE public.leads ENABLE TRIGGER trg_lead_history_lead_update;
ALTER TABLE public.leads ENABLE TRIGGER trg_n8n_lead_updated;
ALTER TABLE public.leads ENABLE TRIGGER trg_webhook_lead_updated;
ALTER TABLE public.leads ENABLE TRIGGER trg_sync_lead_to_medical;
ALTER TABLE public.leads ENABLE TRIGGER trg_sync_lead_to_contact;

UPDATE public.conversations cv SET contact_id = l.contact_id
FROM public.leads l
WHERE cv.lead_id = l.id AND cv.contact_id IS NULL AND l.contact_id IS NOT NULL;

UPDATE public.appointments a SET contact_id = l.contact_id
FROM public.leads l
WHERE a.lead_id = l.id AND a.contact_id IS NULL AND l.contact_id IS NOT NULL;

UPDATE public.lead_attachments la SET contact_id = l.contact_id
FROM public.leads l
WHERE la.lead_id = l.id AND la.contact_id IS NULL AND l.contact_id IS NOT NULL;

UPDATE public.lead_activities la SET contact_id = l.contact_id
FROM public.leads l
WHERE la.lead_id = l.id AND la.contact_id IS NULL AND l.contact_id IS NOT NULL;
