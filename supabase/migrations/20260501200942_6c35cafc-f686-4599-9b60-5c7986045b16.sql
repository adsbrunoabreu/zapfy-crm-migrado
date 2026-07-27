-- Restaurar contact_name das conversas que foram contaminadas com nome do operador
-- quando o lead vinculado existe e tem nome.
UPDATE public.conversations c
SET contact_name = l.name
FROM public.leads l
WHERE c.lead_id = l.id
  AND l.name IS NOT NULL
  AND l.name <> ''
  AND (c.contact_name IS DISTINCT FROM l.name);