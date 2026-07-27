
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS tone text NOT NULL DEFAULT 'casual',
  ADD COLUMN IF NOT EXISTS qualification_questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualification_criteria jsonb NOT NULL DEFAULT
    jsonb_build_object('mode','always','min_answers',3,'keywords',ARRAY[]::text[]),
  ADD COLUMN IF NOT EXISTS offer_scheduling boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_timing text NOT NULL DEFAULT 'qualified',
  ADD COLUMN IF NOT EXISTS available_hours jsonb NOT NULL DEFAULT
    jsonb_build_object(
      'mon', jsonb_build_object('enabled', true,  'start','09:00','end','18:00'),
      'tue', jsonb_build_object('enabled', true,  'start','09:00','end','18:00'),
      'wed', jsonb_build_object('enabled', true,  'start','09:00','end','18:00'),
      'thu', jsonb_build_object('enabled', true,  'start','09:00','end','18:00'),
      'fri', jsonb_build_object('enabled', true,  'start','09:00','end','18:00'),
      'sat', jsonb_build_object('enabled', false, 'start','09:00','end','12:00'),
      'sun', jsonb_build_object('enabled', false, 'start','09:00','end','12:00')
    ),
  ADD COLUMN IF NOT EXISTS auto_confirmation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.ai_agents
  DROP CONSTRAINT IF EXISTS ai_agents_tone_check;
ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_tone_check
  CHECK (tone IN ('formal','casual','tecnico','entusiasta'));

ALTER TABLE public.ai_agents
  DROP CONSTRAINT IF EXISTS ai_agents_offer_timing_check;
ALTER TABLE public.ai_agents
  ADD CONSTRAINT ai_agents_offer_timing_check
  CHECK (offer_timing IN ('always','qualified','on_request'));
