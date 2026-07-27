
CREATE TABLE IF NOT EXISTS public.ai_global_config (
  id boolean PRIMARY KEY DEFAULT true,
  active_provider text NOT NULL DEFAULT 'lovable' CHECK (active_provider IN ('lovable','anthropic','openai','google')),
  active_model text NOT NULL DEFAULT 'google/gemini-3-flash-preview',
  model_active_at timestamptz NOT NULL DEFAULT now(),
  anthropic_model text NOT NULL DEFAULT 'claude-sonnet-4-5-20250929',
  openai_model text NOT NULL DEFAULT 'gpt-5',
  google_model text NOT NULL DEFAULT 'gemini-2.5-flash',
  anthropic_tested_at timestamptz,
  anthropic_test_ok boolean,
  anthropic_test_error text,
  openai_tested_at timestamptz,
  openai_test_ok boolean,
  openai_test_error text,
  google_tested_at timestamptz,
  google_test_ok boolean,
  google_test_error text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_global_config_singleton CHECK (id = true)
);

ALTER TABLE public.ai_global_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master can view ai global config" ON public.ai_global_config;
CREATE POLICY "Master can view ai global config"
  ON public.ai_global_config FOR SELECT
  USING (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Master can insert ai global config" ON public.ai_global_config;
CREATE POLICY "Master can insert ai global config"
  ON public.ai_global_config FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'master'));

DROP POLICY IF EXISTS "Master can update ai global config" ON public.ai_global_config;
CREATE POLICY "Master can update ai global config"
  ON public.ai_global_config FOR UPDATE
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

CREATE OR REPLACE FUNCTION public.touch_ai_global_config()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_ai_global_config ON public.ai_global_config;
CREATE TRIGGER trg_touch_ai_global_config
  BEFORE UPDATE ON public.ai_global_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_ai_global_config();

INSERT INTO public.ai_global_config (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;
