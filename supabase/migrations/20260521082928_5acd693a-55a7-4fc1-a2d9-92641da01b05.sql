
-- ============================================================
-- Drawer da Oportunidade: novas estruturas médicas
-- ============================================================

-- 1) lead_procedures (N procedimentos por lead)
CREATE TABLE IF NOT EXISTS public.lead_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  medical_procedure_id uuid NOT NULL REFERENCES public.medical_procedures(id) ON DELETE RESTRICT,
  company_id uuid NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, medical_procedure_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_procedures_lead ON public.lead_procedures(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_procedures_company ON public.lead_procedures(company_id);

ALTER TABLE public.lead_procedures ENABLE ROW LEVEL SECURITY;

-- Trigger: company_id e created_by automáticos
CREATE OR REPLACE FUNCTION public.set_lead_procedures_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.leads WHERE id = NEW.lead_id;
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_procedures_defaults ON public.lead_procedures;
CREATE TRIGGER trg_lead_procedures_defaults
  BEFORE INSERT ON public.lead_procedures
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_procedures_defaults();

-- RLS
DROP POLICY IF EXISTS "lead_procedures_select" ON public.lead_procedures;
CREATE POLICY "lead_procedures_select" ON public.lead_procedures
  FOR SELECT TO authenticated
  USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS "lead_procedures_insert" ON public.lead_procedures;
CREATE POLICY "lead_procedures_insert" ON public.lead_procedures
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS "lead_procedures_delete" ON public.lead_procedures;
CREATE POLICY "lead_procedures_delete" ON public.lead_procedures
  FOR DELETE TO authenticated
  USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

-- Backfill: migrar leads.medical_procedure_id atual para a nova tabela
INSERT INTO public.lead_procedures (lead_id, medical_procedure_id, company_id)
SELECT id, medical_procedure_id, company_id
FROM public.leads
WHERE medical_procedure_id IS NOT NULL
ON CONFLICT (lead_id, medical_procedure_id) DO NOTHING;


-- 2) lead_medical_notes (append-only, "não editáveis")
CREATE TABLE IF NOT EXISTS public.lead_medical_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  author_id uuid,
  author_name text NOT NULL,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_medical_notes_lead ON public.lead_medical_notes(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_medical_notes_company ON public.lead_medical_notes(company_id);

ALTER TABLE public.lead_medical_notes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_lead_medical_notes_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    SELECT company_id INTO NEW.company_id FROM public.leads WHERE id = NEW.lead_id;
  END IF;
  IF NEW.author_id IS NULL THEN
    NEW.author_id := auth.uid();
  END IF;
  IF NEW.author_name IS NULL OR length(trim(NEW.author_name)) = 0 THEN
    SELECT COALESCE(full_name, email, 'Usuário')
      INTO NEW.author_name
      FROM public.profiles
      WHERE id = NEW.author_id;
    IF NEW.author_name IS NULL THEN NEW.author_name := 'Usuário'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_medical_notes_defaults ON public.lead_medical_notes;
CREATE TRIGGER trg_lead_medical_notes_defaults
  BEFORE INSERT ON public.lead_medical_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_medical_notes_defaults();

-- Append-only: bloquear UPDATE e DELETE (exceto cascade via FK)
CREATE OR REPLACE FUNCTION public.prevent_lead_medical_notes_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'lead_medical_notes são imutáveis (append-only)';
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_medical_notes_no_update ON public.lead_medical_notes;
CREATE TRIGGER trg_lead_medical_notes_no_update
  BEFORE UPDATE ON public.lead_medical_notes
  FOR EACH ROW EXECUTE FUNCTION public.prevent_lead_medical_notes_mutation();

-- RLS
DROP POLICY IF EXISTS "lead_medical_notes_select" ON public.lead_medical_notes;
CREATE POLICY "lead_medical_notes_select" ON public.lead_medical_notes
  FOR SELECT TO authenticated
  USING (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS "lead_medical_notes_insert" ON public.lead_medical_notes;
CREATE POLICY "lead_medical_notes_insert" ON public.lead_medical_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

-- Nenhuma policy de UPDATE/DELETE → bloqueado por RLS


-- 3) lead_attachments.category para separar gerais x médicos
ALTER TABLE public.lead_attachments
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general'
  CHECK (category IN ('general', 'medical'));

CREATE INDEX IF NOT EXISTS idx_lead_attachments_lead_category
  ON public.lead_attachments(lead_id, category);
