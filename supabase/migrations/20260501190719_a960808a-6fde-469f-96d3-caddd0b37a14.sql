ALTER TABLE public.ai_agent_runs ALTER COLUMN agent_id DROP NOT NULL;

ALTER TABLE public.ai_agent_runs DROP CONSTRAINT IF EXISTS ai_agent_runs_status_check;
ALTER TABLE public.ai_agent_runs ADD CONSTRAINT ai_agent_runs_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'running'::text, 'done'::text, 'error'::text, 'skipped'::text, 'blocked'::text]));