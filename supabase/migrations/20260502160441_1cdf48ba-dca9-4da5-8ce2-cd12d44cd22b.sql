ALTER TABLE public.ai_agent_limits
ADD COLUMN IF NOT EXISTS allow_single_agent_fallback boolean NOT NULL DEFAULT true;