-- Atualiza enforce_max_users para também rodar em UPDATE de profiles
-- quando company_id é definido/alterado (caso edge function crie auth.user
-- e depois UPDATE company_id).
CREATE OR REPLACE FUNCTION public.enforce_max_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  -- Em UPDATE, só checa quando company_id muda (ou foi definido pela primeira vez)
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'profiles' THEN
    IF OLD.company_id IS NOT DISTINCT FROM NEW.company_id THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT max_users INTO _max FROM public.get_company_plan_limits(_company_id);
  IF _max IS NULL THEN RETURN NEW; END IF;

  SELECT count(*)::int INTO _current FROM public.profiles
    WHERE company_id = _company_id
      AND (TG_OP <> 'UPDATE' OR id <> NEW.id);
  SELECT count(*)::int INTO _pending FROM public.team_invites
    WHERE company_id = _company_id AND status = 'pending'
      AND email NOT IN (SELECT email FROM public.profiles WHERE company_id = _company_id);

  IF TG_TABLE_NAME = 'profiles' THEN
    IF _current >= _max THEN
      RAISE EXCEPTION 'PLAN_LIMIT_USERS: limite de % usuários atingido', _max
        USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'team_invites' THEN
    IF NEW.status = 'pending' AND (_current + _pending) >= _max THEN
      RAISE EXCEPTION 'PLAN_LIMIT_USERS: limite de % usuários (incluindo convites pendentes) atingido', _max
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_enforce_max_users_profiles_upd ON public.profiles;
CREATE TRIGGER trg_enforce_max_users_profiles_upd
  BEFORE UPDATE OF company_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_users();