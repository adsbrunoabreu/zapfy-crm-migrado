
-- =========================================================
-- Fase 1 — Enforcement de limites do plano (max_users, max_whatsapp_instances, max_leads)
-- =========================================================

-- Helper: limites efetivos da empresa
CREATE OR REPLACE FUNCTION public.get_company_plan_limits(_company_id uuid)
RETURNS TABLE(max_users int, max_leads int, max_whatsapp_instances int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT sp.max_users, sp.max_leads, sp.max_whatsapp_instances
    FROM public.companies c
    LEFT JOIN public.subscription_plans sp ON sp.id = c.selected_plan_id
   WHERE c.id = _company_id
$$;

-- Helper: contadores de uso da empresa
CREATE OR REPLACE FUNCTION public.get_company_plan_usage(_company_id uuid)
RETURNS TABLE(users_count int, pending_invites_count int, instances_count int, leads_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::int FROM public.profiles WHERE company_id = _company_id),
    (SELECT count(*)::int FROM public.team_invites
       WHERE company_id = _company_id AND status = 'pending'
         AND email NOT IN (SELECT email FROM public.profiles WHERE company_id = _company_id)),
    (SELECT count(*)::int FROM public.whatsapp_instances WHERE company_id = _company_id),
    (SELECT count(*)::int FROM public.leads WHERE company_id = _company_id)
$$;

-- =========================================================
-- Trigger 1: max_users (profiles + team_invites pending)
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_max_users()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _max int;
  _current int;
  _pending int;
BEGIN
  -- Master bypass
  IF auth.uid() IS NOT NULL AND public.is_master(auth.uid()) THEN
    RETURN NEW;
  END IF;

  _company_id := NEW.company_id;
  IF _company_id IS NULL THEN RETURN NEW; END IF;

  SELECT max_users INTO _max FROM public.get_company_plan_limits(_company_id);
  -- selected_plan_id null OR max_users null = ilimitado
  IF _max IS NULL THEN RETURN NEW; END IF;

  SELECT count(*)::int INTO _current FROM public.profiles WHERE company_id = _company_id;
  SELECT count(*)::int INTO _pending FROM public.team_invites
    WHERE company_id = _company_id AND status = 'pending'
      AND email NOT IN (SELECT email FROM public.profiles WHERE company_id = _company_id);

  IF TG_TABLE_NAME = 'profiles' THEN
    IF _current >= _max THEN
      RAISE EXCEPTION 'PLAN_LIMIT_USERS: limite de % usuários atingido', _max
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'team_invites' THEN
    -- Só bloqueia se for um convite pending novo
    IF NEW.status = 'pending' AND (_current + _pending) >= _max THEN
      RAISE EXCEPTION 'PLAN_LIMIT_USERS: limite de % usuários (incluindo convites pendentes) atingido', _max
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_users_profiles ON public.profiles;
CREATE TRIGGER trg_enforce_max_users_profiles
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_users();

DROP TRIGGER IF EXISTS trg_enforce_max_users_invites ON public.team_invites;
CREATE TRIGGER trg_enforce_max_users_invites
  BEFORE INSERT ON public.team_invites
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_users();

-- =========================================================
-- Trigger 2: max_whatsapp_instances
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_max_instances()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _max int;
  _current int;
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_master(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  SELECT max_whatsapp_instances INTO _max
    FROM public.get_company_plan_limits(NEW.company_id);
  IF _max IS NULL THEN RETURN NEW; END IF;

  SELECT count(*)::int INTO _current
    FROM public.whatsapp_instances WHERE company_id = NEW.company_id;

  IF _current >= _max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_INSTANCES: limite de % instância(s) WhatsApp atingido', _max
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_instances ON public.whatsapp_instances;
CREATE TRIGGER trg_enforce_max_instances
  BEFORE INSERT ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_instances();

-- =========================================================
-- Trigger 3: max_leads
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_max_leads()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _max int;
  _current int;
BEGIN
  IF auth.uid() IS NOT NULL AND public.is_master(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN RETURN NEW; END IF;

  SELECT max_leads INTO _max
    FROM public.get_company_plan_limits(NEW.company_id);
  IF _max IS NULL THEN RETURN NEW; END IF;

  SELECT count(*)::int INTO _current
    FROM public.leads WHERE company_id = NEW.company_id;

  IF _current >= _max THEN
    RAISE EXCEPTION 'PLAN_LIMIT_LEADS: limite de % leads atingido', _max
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_max_leads ON public.leads;
CREATE TRIGGER trg_enforce_max_leads
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_leads();
