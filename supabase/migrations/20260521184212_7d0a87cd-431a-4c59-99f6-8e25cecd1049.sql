INSERT INTO public.financial_entries (
  company_id, kind, category_id, lead_id, contact_id, party_name,
  description, amount, due_date, status, metadata, created_by
)
SELECT
  l.company_id,
  'receivable',
  (SELECT id FROM public.financial_categories
    WHERE company_id = l.company_id AND name = 'Vendas' LIMIT 1),
  l.id,
  l.contact_id,
  l.name,
  'Venda — ' || l.name,
  l.value,
  (COALESCE(l.closed_at, now())::date + INTERVAL '7 days')::date,
  'draft',
  jsonb_build_object('auto', true, 'backfill', true, 'lead_numeric_id', l.numeric_id),
  l.closed_by
FROM public.leads l
WHERE l.status = 'won'
  AND COALESCE(l.value, 0) > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.financial_entries fe
    WHERE fe.lead_id = l.id AND fe.kind = 'receivable' AND fe.status <> 'canceled'
  );