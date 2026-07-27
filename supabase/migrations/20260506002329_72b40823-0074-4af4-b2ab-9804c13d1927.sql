
CREATE TABLE IF NOT EXISTS public.store_worker_config (
  id boolean PRIMARY KEY DEFAULT true,
  max_batch integer NOT NULL DEFAULT 10 CHECK (max_batch BETWEEN 1 AND 100),
  concurrency integer NOT NULL DEFAULT 3 CHECK (concurrency BETWEEN 1 AND 20),
  max_per_company integer NOT NULL DEFAULT 2 CHECK (max_per_company BETWEEN 1 AND 50),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT store_worker_config_singleton CHECK (id = true)
);

ALTER TABLE public.store_worker_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "store_worker_config_master_select" ON public.store_worker_config
  FOR SELECT TO authenticated USING (has_role(auth.uid(), 'master'::app_role));

CREATE POLICY "store_worker_config_master_write" ON public.store_worker_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'master'::app_role))
  WITH CHECK (has_role(auth.uid(), 'master'::app_role));

INSERT INTO public.store_worker_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
