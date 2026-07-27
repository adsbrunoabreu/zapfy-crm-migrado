ALTER TABLE public.companies DROP CONSTRAINT IF EXISTS companies_brand_palette_check;
ALTER TABLE public.companies ADD CONSTRAINT companies_brand_palette_check
  CHECK (brand_palette = ANY (ARRAY['graphite','emerald','azure','violet','sunset','crimson','ocean','rose','pitada','zapfy']));