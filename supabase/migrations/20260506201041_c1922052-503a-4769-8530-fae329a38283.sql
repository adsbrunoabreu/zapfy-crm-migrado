ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS selected_plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL;