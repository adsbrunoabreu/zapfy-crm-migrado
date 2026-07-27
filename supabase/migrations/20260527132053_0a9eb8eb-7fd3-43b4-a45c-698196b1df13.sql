
-- =============== 1) Tabela products ===============
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  base_price numeric(14,2) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_company_active ON public.products(company_id, active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_name_lower
  ON public.products(company_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_company"
  ON public.products FOR SELECT TO authenticated
  USING (
    public.is_master(auth.uid())
    OR company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "products_modify_company"
  ON public.products FOR ALL TO authenticated
  USING (
    public.is_master(auth.uid())
    OR (
      company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      AND public.is_company_active(company_id)
    )
  )
  WITH CHECK (
    public.is_master(auth.uid())
    OR (
      company_id = (SELECT company_id FROM public.profiles WHERE id = auth.uid())
      AND public.is_company_active(company_id)
    )
  );

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============== 2) lead_procedures: tipo do item ===============
ALTER TABLE public.lead_procedures
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS item_name_snapshot text;

-- relaxa NOT NULL do medical_procedure_id (produtos não têm)
ALTER TABLE public.lead_procedures
  ALTER COLUMN medical_procedure_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.lead_procedures
    ADD CONSTRAINT lead_procedures_item_type_chk
    CHECK (item_type IN ('service','product'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.lead_procedures
    ADD CONSTRAINT lead_procedures_item_ref_chk
    CHECK (
      (item_type = 'service' AND medical_procedure_id IS NOT NULL)
      OR
      (item_type = 'product' AND product_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- garante linhas antigas marcadas como service
UPDATE public.lead_procedures SET item_type = 'service' WHERE item_type IS NULL OR item_type = '';

-- =============== 3) Trigger: split de receita ao virar Ganho ===============
CREATE OR REPLACE FUNCTION public.tg_lead_won_create_receivable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_stage_type text;
  v_old_stage_type text;
  v_exists boolean;
  v_total_services numeric := 0;
  v_total_products numeric := 0;
  v_items_count int := 0;
  v_cat_services uuid;
  v_cat_sales uuid;
  v_due date := (now()::date + INTERVAL '7 days')::date;
BEGIN
  SELECT stage_type INTO v_new_stage_type FROM public.pipeline_stages WHERE id = NEW.stage_id;
  IF TG_OP = 'UPDATE' THEN
    SELECT stage_type INTO v_old_stage_type FROM public.pipeline_stages WHERE id = OLD.stage_id;
  END IF;

  IF v_new_stage_type IS DISTINCT FROM 'won' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND v_old_stage_type = 'won' THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.value, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- evita duplicar se já existir entry vinculada (independente do split)
  SELECT EXISTS(
    SELECT 1 FROM public.financial_entries
    WHERE lead_id = NEW.id AND kind = 'receivable' AND status <> 'canceled'
  ) INTO v_exists;
  IF v_exists THEN RETURN NEW; END IF;

  -- soma os itens por tipo (líquido = price_snapshot*qty - desconto)
  SELECT
    COUNT(*),
    COALESCE(SUM(CASE WHEN item_type='service' THEN
      COALESCE(net_price,
        GREATEST(
          COALESCE(price_snapshot,0) * COALESCE(quantity,1)
          - COALESCE(discount_amount,
              COALESCE(price_snapshot,0) * COALESCE(quantity,1) * COALESCE(discount_pct,0) / 100),
          0)
      ) END), 0),
    COALESCE(SUM(CASE WHEN item_type='product' THEN
      COALESCE(net_price,
        GREATEST(
          COALESCE(price_snapshot,0) * COALESCE(quantity,1)
          - COALESCE(discount_amount,
              COALESCE(price_snapshot,0) * COALESCE(quantity,1) * COALESCE(discount_pct,0) / 100),
          0)
      ) END), 0)
  INTO v_items_count, v_total_services, v_total_products
  FROM public.lead_procedures
  WHERE lead_id = NEW.id;

  -- categorias preferenciais por dre_section / nome
  SELECT id INTO v_cat_services FROM public.financial_categories
    WHERE company_id = NEW.company_id
      AND (dre_section = 'receita_servicos' OR lower(name) = 'serviços' OR lower(name) = 'servicos')
    ORDER BY (dre_section = 'receita_servicos') DESC NULLS LAST
    LIMIT 1;

  SELECT id INTO v_cat_sales FROM public.financial_categories
    WHERE company_id = NEW.company_id
      AND (dre_section = 'receita_vendas' OR lower(name) = 'vendas')
    ORDER BY (dre_section = 'receita_vendas') DESC NULLS LAST
    LIMIT 1;

  IF v_items_count = 0 THEN
    -- fallback: comportamento antigo (1 lançamento em Vendas com o valor total do lead)
    INSERT INTO public.financial_entries (
      company_id, kind, category_id, lead_id, contact_id, party_name,
      description, amount, due_date, status, metadata, created_by
    ) VALUES (
      NEW.company_id, 'receivable', v_cat_sales, NEW.id, NEW.contact_id, NEW.name,
      'Venda — ' || NEW.name, NEW.value, v_due, 'draft',
      jsonb_build_object('auto', true, 'lead_numeric_id', NEW.numeric_id),
      NEW.closed_by
    );
    RETURN NEW;
  END IF;

  IF v_total_services > 0 THEN
    INSERT INTO public.financial_entries (
      company_id, kind, category_id, lead_id, contact_id, party_name,
      description, amount, due_date, status, metadata, created_by
    ) VALUES (
      NEW.company_id, 'receivable', v_cat_services, NEW.id, NEW.contact_id, NEW.name,
      'Serviços — ' || NEW.name, v_total_services, v_due, 'draft',
      jsonb_build_object('auto', true, 'item_type', 'service', 'lead_numeric_id', NEW.numeric_id),
      NEW.closed_by
    );
  END IF;

  IF v_total_products > 0 THEN
    INSERT INTO public.financial_entries (
      company_id, kind, category_id, lead_id, contact_id, party_name,
      description, amount, due_date, status, metadata, created_by
    ) VALUES (
      NEW.company_id, 'receivable', v_cat_sales, NEW.id, NEW.contact_id, NEW.name,
      'Produtos — ' || NEW.name, v_total_products, v_due, 'draft',
      jsonb_build_object('auto', true, 'item_type', 'product', 'lead_numeric_id', NEW.numeric_id),
      NEW.closed_by
    );
  END IF;

  -- Se a soma dos itens não bate com lead.value (ex.: nenhum item ou apenas alguns cadastrados),
  -- cobre a diferença em "Vendas" para não perder receita
  IF (v_total_services + v_total_products) > 0
     AND NEW.value > (v_total_services + v_total_products) THEN
    INSERT INTO public.financial_entries (
      company_id, kind, category_id, lead_id, contact_id, party_name,
      description, amount, due_date, status, metadata, created_by
    ) VALUES (
      NEW.company_id, 'receivable', v_cat_sales, NEW.id, NEW.contact_id, NEW.name,
      'Outros — ' || NEW.name,
      NEW.value - (v_total_services + v_total_products),
      v_due, 'draft',
      jsonb_build_object('auto', true, 'item_type', 'other', 'lead_numeric_id', NEW.numeric_id),
      NEW.closed_by
    );
  END IF;

  RETURN NEW;
END;
$function$;
