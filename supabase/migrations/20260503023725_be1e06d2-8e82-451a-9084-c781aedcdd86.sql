-- 1. Adiciona coluna instance_id
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE;

-- 2. Permite pipeline_id NULL (legado)
ALTER TABLE public.ai_agents
  ALTER COLUMN pipeline_id DROP NOT NULL;

-- 3. Backfill: vincula cada agente à primeira instância da empresa
UPDATE public.ai_agents a
SET instance_id = (
  SELECT id FROM public.whatsapp_instances wi
  WHERE wi.company_id = a.company_id
  ORDER BY wi.created_at ASC
  LIMIT 1
)
WHERE a.instance_id IS NULL;

-- 4. Remove unique constraint antiga (1 agente por pipeline)
ALTER TABLE public.ai_agents
  DROP CONSTRAINT IF EXISTS ai_agents_pipeline_id_key;

-- 5. Cria unique parcial: 1 agente por instância
CREATE UNIQUE INDEX IF NOT EXISTS ai_agents_instance_id_key
  ON public.ai_agents(instance_id)
  WHERE instance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_agents_company_instance
  ON public.ai_agents(company_id, instance_id);