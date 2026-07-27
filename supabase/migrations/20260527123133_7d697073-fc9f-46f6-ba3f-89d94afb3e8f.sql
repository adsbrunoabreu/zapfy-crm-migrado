
DROP TRIGGER IF EXISTS trg_lead_won_create_receivable ON public.leads;

CREATE TRIGGER trg_lead_won_create_receivable
AFTER INSERT OR UPDATE OF stage_id, status ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.tg_lead_won_create_receivable();

-- Backfill: cria receivables para leads won que ficaram sem entry
DO $$
DECLARE
  r RECORD;
  v_cat_id uuid;
BEGIN
  FOR r IN
    SELECT l.* FROM public.leads l
    JOIN public.pipeline_stages ps ON ps.id = l.stage_id
    WHERE ps.stage_type = 'won'
      AND COALESCE(l.value, 0) > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.financial_entries fe
        WHERE fe.lead_id = l.id AND fe.kind = 'receivable' AND fe.status <> 'canceled'
      )
  LOOP
    SELECT id INTO v_cat_id
    FROM public.financial_categories
    WHERE company_id = r.company_id AND name = 'Vendas'
    LIMIT 1;

    INSERT INTO public.financial_entries (
      company_id, kind, category_id, lead_id, contact_id, party_name,
      description, amount, due_date, status, metadata, created_by
    ) VALUES (
      r.company_id, 'receivable', v_cat_id, r.id, r.contact_id, r.name,
      'Venda — ' || r.name, r.value,
      (now()::date + INTERVAL '7 days')::date,
      'draft',
      jsonb_build_object('auto', true, 'backfill', true, 'lead_numeric_id', r.numeric_id),
      r.closed_by
    );
  END LOOP;
END $$;
