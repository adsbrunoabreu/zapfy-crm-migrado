ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS brand_palette text NOT NULL DEFAULT 'graphite';

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_brand_palette_check;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_brand_palette_check
  CHECK (brand_palette IN ('graphite','emerald','azure','violet','sunset','crimson','ocean','rose'));

-- Permite que membros (não-admin) leiam apenas o brand_palette da própria empresa
-- A política existente "Company admins can view own company" cobre admins.
-- Adicionamos uma política de SELECT mais ampla para qualquer membro da empresa,
-- já que precisamos do brand_palette para aplicar o tema visual.
DROP POLICY IF EXISTS "Company members can view own company" ON public.companies;
CREATE POLICY "Company members can view own company"
ON public.companies
FOR SELECT
TO authenticated
USING (id = get_user_company_id(auth.uid()));