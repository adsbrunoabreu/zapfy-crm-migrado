-- Create user_goals table for individual targets
CREATE TABLE public.user_goals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  goal_type text NOT NULL CHECK (goal_type IN ('leads', 'value', 'conversions')),
  target_value numeric NOT NULL DEFAULT 0,
  period_start date NOT NULL,
  period_end date NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  UNIQUE(company_id, user_id, goal_type, period_start, period_end)
);

-- Enable RLS
ALTER TABLE public.user_goals ENABLE ROW LEVEL SECURITY;

-- Company admins can manage all goals
CREATE POLICY "Company admins can manage goals"
ON public.user_goals
FOR ALL
USING (
  (company_id = get_user_company_id(auth.uid())) 
  AND is_company_admin(auth.uid())
);

-- Users can view their own goals
CREATE POLICY "Users can view own goals"
ON public.user_goals
FOR SELECT
USING (
  user_id = auth.uid() 
  OR (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()))
);

-- Create index for performance
CREATE INDEX idx_user_goals_user_period ON public.user_goals(user_id, period_start, period_end);
CREATE INDEX idx_user_goals_company ON public.user_goals(company_id);