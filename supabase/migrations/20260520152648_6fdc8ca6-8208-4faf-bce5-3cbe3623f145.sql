ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS tenant_seq integer;

-- Temporarily bypass triggers (closed-lead lock) for backfill
SET session_replication_role = replica;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY company_id ORDER BY created_at, id) AS rn
  FROM public.leads
  WHERE tenant_seq IS NULL
)
UPDATE public.leads l
SET tenant_seq = r.rn
FROM ranked r
WHERE l.id = r.id;

SET session_replication_role = DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS leads_company_tenant_seq_unique
  ON public.leads (company_id, tenant_seq);

CREATE OR REPLACE FUNCTION public.set_lead_tenant_seq()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq integer;
BEGIN
  IF NEW.tenant_seq IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(tenant_seq), 0) + 1
    INTO next_seq
    FROM public.leads
    WHERE company_id = NEW.company_id
    FOR UPDATE;

  NEW.tenant_seq := next_seq;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lead_tenant_seq ON public.leads;
CREATE TRIGGER trg_set_lead_tenant_seq
BEFORE INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_tenant_seq();