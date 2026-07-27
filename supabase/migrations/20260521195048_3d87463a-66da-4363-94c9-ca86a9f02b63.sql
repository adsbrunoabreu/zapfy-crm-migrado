
-- Tabela de origens de lead por empresa
CREATE TABLE IF NOT EXISTS public.lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_sources_company_active
  ON public.lead_sources (company_id, is_active, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_sources_company_label
  ON public.lead_sources (company_id, lower(label));

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_lead_sources_updated_at ON public.lead_sources;
CREATE TRIGGER trg_lead_sources_updated_at
  BEFORE UPDATE ON public.lead_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lead_sources_select ON public.lead_sources;
CREATE POLICY lead_sources_select ON public.lead_sources
  FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS lead_sources_insert ON public.lead_sources;
CREATE POLICY lead_sources_insert ON public.lead_sources
  FOR INSERT TO authenticated
  WITH CHECK (
    is_master(auth.uid())
    OR (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id))
  );

DROP POLICY IF EXISTS lead_sources_update ON public.lead_sources;
CREATE POLICY lead_sources_update ON public.lead_sources
  FOR UPDATE TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()))
  WITH CHECK (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS lead_sources_delete ON public.lead_sources;
CREATE POLICY lead_sources_delete ON public.lead_sources
  FOR DELETE TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

-- Função de seed dos padrões
CREATE OR REPLACE FUNCTION public.seed_default_lead_sources(_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lead_sources (company_id, label, sort_order, is_active)
  VALUES
    (_company_id, 'Site', 1, true),
    (_company_id, 'Indicação', 2, true),
    (_company_id, 'Anúncios', 3, true),
    (_company_id, 'Cliente', 4, true)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_default_lead_sources(uuid) TO authenticated;

-- Trigger no INSERT de companies para semear
CREATE OR REPLACE FUNCTION public.trg_companies_seed_lead_sources()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_lead_sources(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_seed_lead_sources ON public.companies;
CREATE TRIGGER trg_companies_seed_lead_sources
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.trg_companies_seed_lead_sources();

-- Backfill para empresas existentes
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_default_lead_sources(c.id);
  END LOOP;
END $$;
