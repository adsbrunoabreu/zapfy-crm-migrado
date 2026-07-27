-- 1) Cor por instância
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS color text;

-- Backfill: atribui uma cor a partir de uma paleta para instâncias existentes
DO $$
DECLARE
  palette text[] := ARRAY[
    '#6366f1','#22c55e','#ec4899','#f59e0b','#06b6d4','#a855f7','#ef4444','#14b8a6','#f97316','#3b82f6'
  ];
  rec RECORD;
  idx int := 1;
BEGIN
  FOR rec IN
    SELECT id FROM public.whatsapp_instances WHERE color IS NULL ORDER BY created_at NULLS LAST, id
  LOOP
    UPDATE public.whatsapp_instances
       SET color = palette[((idx - 1) % array_length(palette,1)) + 1]
     WHERE id = rec.id;
    idx := idx + 1;
  END LOOP;
END $$;

-- 2) Tabela de templates HSM (Meta WhatsApp Cloud API)
CREATE TABLE IF NOT EXISTS public.whatsapp_hsm_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  meta_template_id text,
  name text NOT NULL,
  language text NOT NULL,
  category text NOT NULL,
  status text NOT NULL,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_hsm_templates_instance_name_lang
  ON public.whatsapp_hsm_templates (instance_id, name, language);

CREATE INDEX IF NOT EXISTS idx_hsm_templates_company_status
  ON public.whatsapp_hsm_templates (company_id, status);

CREATE INDEX IF NOT EXISTS idx_hsm_templates_instance
  ON public.whatsapp_hsm_templates (instance_id);

ALTER TABLE public.whatsapp_hsm_templates ENABLE ROW LEVEL SECURITY;

-- Members da empresa podem ler
DROP POLICY IF EXISTS "Members can view HSM templates" ON public.whatsapp_hsm_templates;
CREATE POLICY "Members can view HSM templates"
  ON public.whatsapp_hsm_templates FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    OR public.has_role(auth.uid(), 'master')
  );

-- Apenas master ou service_role pode escrever (sync via edge function usa service_role e bypassa RLS)
DROP POLICY IF EXISTS "Master manages HSM templates" ON public.whatsapp_hsm_templates;
CREATE POLICY "Master manages HSM templates"
  ON public.whatsapp_hsm_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_hsm_templates_updated_at ON public.whatsapp_hsm_templates;
CREATE TRIGGER trg_hsm_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_hsm_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();