
CREATE TABLE IF NOT EXISTS public.instance_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_name text NOT NULL UNIQUE,
  scope text NOT NULL DEFAULT 'company', -- 'system' (interna) ou 'company'
  company_id uuid NULL,
  last_state text NOT NULL DEFAULT 'unknown',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  down_since timestamptz NULL,
  down_alerted_at timestamptz NULL,
  recovered_alerted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_instance_health_company ON public.instance_health(company_id);
CREATE INDEX IF NOT EXISTS idx_instance_health_down_since ON public.instance_health(down_since) WHERE down_since IS NOT NULL;

ALTER TABLE public.instance_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can manage instance_health"
ON public.instance_health
FOR ALL
TO authenticated
USING (public.is_master(auth.uid()))
WITH CHECK (public.is_master(auth.uid()));

CREATE TRIGGER instance_health_updated_at
BEFORE UPDATE ON public.instance_health
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
