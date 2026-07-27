ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS max_pipelines integer;

UPDATE public.subscription_plans SET max_pipelines = 1 WHERE name ILIKE 'starter';
UPDATE public.subscription_plans SET max_pipelines = 5 WHERE name ILIKE 'pro';
UPDATE public.subscription_plans SET max_pipelines = NULL WHERE name ILIKE 'enterprise' OR name ILIKE 'business';

DROP FUNCTION IF EXISTS public.get_company_plan_limits(uuid);
CREATE OR REPLACE FUNCTION public.get_company_plan_limits(_company_id uuid)
RETURNS TABLE(max_users integer, max_leads integer, max_whatsapp_instances integer, max_pipelines integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT sp.max_users, sp.max_leads, sp.max_whatsapp_instances, sp.max_pipelines
    FROM public.companies c
    LEFT JOIN public.subscription_plans sp ON sp.id = c.selected_plan_id
   WHERE c.id = _company_id
$function$;

DROP FUNCTION IF EXISTS public.get_company_plan_usage(uuid);
CREATE OR REPLACE FUNCTION public.get_company_plan_usage(_company_id uuid)
RETURNS TABLE(users_count integer, pending_invites_count integer, instances_count integer, leads_count integer, pipelines_count integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int FROM public.profiles WHERE company_id = _company_id),
    (SELECT count(*)::int FROM public.team_invites
       WHERE company_id = _company_id AND status = 'pending'
         AND email NOT IN (SELECT email FROM public.profiles WHERE company_id = _company_id)),
    (SELECT count(*)::int FROM public.whatsapp_instances WHERE company_id = _company_id),
    (SELECT count(*)::int FROM public.leads WHERE company_id = _company_id),
    (SELECT count(*)::int FROM public.pipelines WHERE company_id = _company_id)
$function$;

CREATE OR REPLACE FUNCTION public.enforce_pipelines_plan_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_max integer;
  v_current integer;
BEGIN
  SELECT sp.max_pipelines INTO v_max
    FROM public.companies c
    LEFT JOIN public.subscription_plans sp ON sp.id = c.selected_plan_id
   WHERE c.id = NEW.company_id;

  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)::int INTO v_current
    FROM public.pipelines
   WHERE company_id = NEW.company_id;

  IF v_current >= v_max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_PIPELINES: limite de % pipeline(s) atingido para o plano atual', v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_pipelines_plan_limit ON public.pipelines;
CREATE TRIGGER trg_enforce_pipelines_plan_limit
  BEFORE INSERT ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pipelines_plan_limit();