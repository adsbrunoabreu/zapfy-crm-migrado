
-- ============================================================
-- 1) medical_insurances
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medical_insurances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  practice_id uuid REFERENCES public.medical_practices(id) ON DELETE CASCADE,
  name text NOT NULL,
  ans_code text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT medical_insurances_company_name_uniq UNIQUE (company_id, name)
);
CREATE INDEX IF NOT EXISTS idx_medical_insurances_company ON public.medical_insurances(company_id);
CREATE INDEX IF NOT EXISTS idx_medical_insurances_active  ON public.medical_insurances(active);

ALTER TABLE public.medical_insurances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medical_insurances_select" ON public.medical_insurances;
DROP POLICY IF EXISTS "medical_insurances_insert" ON public.medical_insurances;
DROP POLICY IF EXISTS "medical_insurances_update" ON public.medical_insurances;
DROP POLICY IF EXISTS "medical_insurances_delete" ON public.medical_insurances;

CREATE POLICY "medical_insurances_select" ON public.medical_insurances
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'master'::app_role)
         OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "medical_insurances_insert" ON public.medical_insurances
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
              AND public.is_company_active(company_id));
CREATE POLICY "medical_insurances_update" ON public.medical_insurances
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'master'::app_role)
         OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (has_role(auth.uid(),'master'::app_role)
              OR (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
                  AND public.is_company_active(company_id)));
CREATE POLICY "medical_insurances_delete" ON public.medical_insurances
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'master'::app_role)
         OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP TRIGGER IF EXISTS trg_medical_insurances_updated_at ON public.medical_insurances;
CREATE TRIGGER trg_medical_insurances_updated_at
  BEFORE UPDATE ON public.medical_insurances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) medical_facilities
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medical_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  practice_id uuid REFERENCES public.medical_practices(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'clinic' CHECK (kind IN ('hospital','clinic')),
  cnpj text, phone text, address text, city text, state text, notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_medical_facilities_company ON public.medical_facilities(company_id);
CREATE INDEX IF NOT EXISTS idx_medical_facilities_active  ON public.medical_facilities(active);

ALTER TABLE public.medical_facilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medical_facilities_select" ON public.medical_facilities;
DROP POLICY IF EXISTS "medical_facilities_insert" ON public.medical_facilities;
DROP POLICY IF EXISTS "medical_facilities_update" ON public.medical_facilities;
DROP POLICY IF EXISTS "medical_facilities_delete" ON public.medical_facilities;

CREATE POLICY "medical_facilities_select" ON public.medical_facilities
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'master'::app_role)
         OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "medical_facilities_insert" ON public.medical_facilities
  FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
              AND public.is_company_active(company_id));
CREATE POLICY "medical_facilities_update" ON public.medical_facilities
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'master'::app_role)
         OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (has_role(auth.uid(),'master'::app_role)
              OR (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
                  AND public.is_company_active(company_id)));
CREATE POLICY "medical_facilities_delete" ON public.medical_facilities
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'master'::app_role)
         OR company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

DROP TRIGGER IF EXISTS trg_medical_facilities_updated_at ON public.medical_facilities;
CREATE TRIGGER trg_medical_facilities_updated_at
  BEFORE UPDATE ON public.medical_facilities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) FKs em leads
-- ============================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS insurance_id uuid REFERENCES public.medical_insurances(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS facility_id  uuid REFERENCES public.medical_facilities(id)  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_insurance_id ON public.leads(insurance_id);
CREATE INDEX IF NOT EXISTS idx_leads_facility_id  ON public.leads(facility_id);

-- ============================================================
-- 4) Trigger para manter texto leads.insurance em sincronia
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_lead_insurance_text()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  IF NEW.insurance_id IS NOT NULL
     AND NEW.insurance_id IS DISTINCT FROM COALESCE(OLD.insurance_id, NULL) THEN
    SELECT name INTO v_name FROM public.medical_insurances WHERE id = NEW.insurance_id;
    IF v_name IS NOT NULL THEN NEW.insurance := v_name; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_lead_insurance_text ON public.leads;
CREATE TRIGGER trg_sync_lead_insurance_text
  BEFORE INSERT OR UPDATE OF insurance_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.sync_lead_insurance_text();

-- ============================================================
-- 5) Backfill — desabilita trigger de imutabilidade só aqui
-- ============================================================
ALTER TABLE public.leads DISABLE TRIGGER USER;

-- 5a) Convênios distintos a partir do texto livre
INSERT INTO public.medical_insurances (company_id, practice_id, name)
SELECT DISTINCT l.company_id, mp.id, btrim(l.insurance)
FROM public.leads l
JOIN public.medical_practices mp ON mp.company_id = l.company_id
JOIN public.companies c ON c.id = l.company_id
WHERE c.crm_vertical = 'medical'
  AND l.insurance IS NOT NULL
  AND btrim(l.insurance) <> ''
ON CONFLICT (company_id, name) DO NOTHING;

-- 5b) Linka leads.insurance_id pelo nome
UPDATE public.leads l
SET insurance_id = mi.id
FROM public.medical_insurances mi
WHERE l.insurance_id IS NULL
  AND l.insurance IS NOT NULL
  AND btrim(l.insurance) <> ''
  AND mi.company_id = l.company_id
  AND lower(btrim(mi.name)) = lower(btrim(l.insurance));

-- 5c) Cria 1 facility por empresa médica a partir da practice ativa
INSERT INTO public.medical_facilities (company_id, practice_id, name, kind, cnpj, city, state)
SELECT mp.company_id, mp.id, COALESCE(mp.practice_name, 'Unidade principal'),
       CASE WHEN mp.crm_type = 'hospital' THEN 'hospital' ELSE 'clinic' END,
       mp.cnpj, mp.city, mp.state
FROM public.medical_practices mp
WHERE NOT EXISTS (
  SELECT 1 FROM public.medical_facilities f WHERE f.company_id = mp.company_id
);

-- 5d) Linka leads à primeira facility da empresa
UPDATE public.leads l
SET facility_id = f.id
FROM (
  SELECT DISTINCT ON (company_id) id, company_id
  FROM public.medical_facilities
  ORDER BY company_id, created_at ASC
) f
WHERE l.facility_id IS NULL
  AND l.company_id = f.company_id;

ALTER TABLE public.leads ENABLE TRIGGER USER;
