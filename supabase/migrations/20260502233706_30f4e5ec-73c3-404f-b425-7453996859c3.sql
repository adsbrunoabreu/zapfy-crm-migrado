
ALTER TABLE public.ai_global_config
  ADD COLUMN IF NOT EXISTS consecutive_failures int NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.ai_config_rate_limit (
  user_id uuid NOT NULL,
  provider text NOT NULL,
  last_test_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE public.ai_config_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master manages rate limit"
ON public.ai_config_rate_limit
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'master'::app_role))
WITH CHECK (has_role(auth.uid(), 'master'::app_role));
