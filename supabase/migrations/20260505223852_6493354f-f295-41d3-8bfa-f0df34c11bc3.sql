
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ecommerce_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.store_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('shopify')),
  display_name text NOT NULL,
  store_url text NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','error')),
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at timestamptz,
  last_sync_error text,
  product_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id)
);
CREATE INDEX idx_store_integrations_company ON public.store_integrations(company_id);

CREATE TABLE public.store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_integration_id uuid NOT NULL REFERENCES public.store_integrations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  variant_id text,
  sku text,
  title text NOT NULL,
  description text,
  price numeric(12,2) NOT NULL DEFAULT 0,
  compare_at_price numeric(12,2),
  currency text NOT NULL DEFAULT 'BRL',
  stock integer,
  image_url text,
  product_url text,
  categories text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  search_tsv tsvector,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_integration_id, external_id, variant_id)
);
CREATE INDEX idx_store_products_company ON public.store_products(company_id) WHERE is_active;
CREATE INDEX idx_store_products_search ON public.store_products USING GIN(search_tsv);
CREATE INDEX idx_store_products_tags ON public.store_products USING GIN(tags);

CREATE OR REPLACE FUNCTION public.store_products_update_tsv()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.search_tsv :=
    setweight(to_tsvector('portuguese', coalesce(NEW.title,'')), 'A') ||
    setweight(to_tsvector('portuguese', array_to_string(NEW.tags,' ')), 'B') ||
    setweight(to_tsvector('portuguese', coalesce(NEW.description,'')), 'C');
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_store_products_tsv BEFORE INSERT OR UPDATE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.store_products_update_tsv();

CREATE TABLE public.store_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_integration_id uuid NOT NULL REFERENCES public.store_integrations(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  external_cart_id text,
  checkout_url text NOT NULL,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  coupon_code text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','abandoned','converted','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  converted_at timestamptz
);
CREATE INDEX idx_store_carts_company ON public.store_carts(company_id);
CREATE INDEX idx_store_carts_conversation ON public.store_carts(conversation_id);
CREATE INDEX idx_store_carts_status ON public.store_carts(company_id, status);

CREATE TABLE public.store_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  store_integration_id uuid NOT NULL REFERENCES public.store_integrations(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric(12,2) NOT NULL,
  min_order_value numeric(12,2),
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  agent_can_offer boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, code)
);
CREATE INDEX idx_store_coupons_company ON public.store_coupons(company_id);

CREATE TABLE public.store_recommendations_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  product_ids uuid[] NOT NULL DEFAULT '{}',
  reason text,
  query_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_store_reco_company_date ON public.store_recommendations_log(company_id, created_at DESC);

CREATE TRIGGER trg_store_integrations_updated BEFORE UPDATE ON public.store_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_store_products_updated BEFORE UPDATE ON public.store_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_store_carts_updated BEFORE UPDATE ON public.store_carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_store_coupons_updated BEFORE UPDATE ON public.store_coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.store_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_recommendations_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_integrations_select" ON public.store_integrations FOR SELECT
  USING (public.has_role(auth.uid(),'master')
    OR (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND public.is_company_active(company_id)));
CREATE POLICY "store_integrations_write" ON public.store_integrations FOR ALL
  USING (public.has_role(auth.uid(),'master')
    OR (public.has_role(auth.uid(),'company_admin')
        AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND public.is_company_active(company_id)))
  WITH CHECK (public.has_role(auth.uid(),'master')
    OR (public.has_role(auth.uid(),'company_admin')
        AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND public.is_company_active(company_id)));

CREATE POLICY "store_products_select" ON public.store_products FOR SELECT
  USING (public.has_role(auth.uid(),'master')
    OR (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND public.is_company_active(company_id)));
CREATE POLICY "store_products_write" ON public.store_products FOR ALL
  USING (public.has_role(auth.uid(),'master')
    OR (public.has_role(auth.uid(),'company_admin')
        AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())))
  WITH CHECK (public.has_role(auth.uid(),'master')
    OR (public.has_role(auth.uid(),'company_admin')
        AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));

CREATE POLICY "store_carts_select" ON public.store_carts FOR SELECT
  USING (public.has_role(auth.uid(),'master')
    OR (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND public.is_company_active(company_id)));

CREATE POLICY "store_coupons_select" ON public.store_coupons FOR SELECT
  USING (public.has_role(auth.uid(),'master')
    OR (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND public.is_company_active(company_id)));
CREATE POLICY "store_coupons_write" ON public.store_coupons FOR ALL
  USING (public.has_role(auth.uid(),'master')
    OR (public.has_role(auth.uid(),'company_admin')
        AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND public.is_company_active(company_id)))
  WITH CHECK (public.has_role(auth.uid(),'master')
    OR (public.has_role(auth.uid(),'company_admin')
        AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
        AND public.is_company_active(company_id)));

CREATE POLICY "store_reco_select" ON public.store_recommendations_log FOR SELECT
  USING (public.has_role(auth.uid(),'master')
    OR (public.has_role(auth.uid(),'company_admin')
        AND company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())));
