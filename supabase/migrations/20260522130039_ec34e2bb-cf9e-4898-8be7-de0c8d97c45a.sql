
-- 1) handle_new_user: default role 'agente'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.email),
    COALESCE((new.raw_user_meta_data ->> 'role')::app_role, 'agente'::app_role)
  );
  RETURN new;
END;
$function$;

-- 2) pick_reopen_assignee(uuid)
CREATE OR REPLACE FUNCTION public.pick_reopen_assignee(_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _instance_id uuid;
  _candidate uuid;
  _has_instance_links boolean := false;
  _ok boolean := false;
  _next uuid;
BEGIN
  SELECT company_id, instance_id INTO _company_id, _instance_id
    FROM public.conversations WHERE id = _conversation_id;
  IF _company_id IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(assigned_to, closed_by) INTO _candidate
    FROM public.attendance_tickets
   WHERE conversation_id = _conversation_id
   ORDER BY created_at DESC LIMIT 1;

  IF _instance_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.instance_agents WHERE instance_id = _instance_id)
      INTO _has_instance_links;
  END IF;

  IF _candidate IS NOT NULL THEN
    SELECT TRUE INTO _ok
      FROM public.profiles p
     WHERE p.id = _candidate
       AND p.company_id = _company_id
       AND COALESCE(p.is_active, true) = true
       AND COALESCE(p.is_online, false) = true
       AND (
         NOT _has_instance_links
         OR p.role IN ('admin'::app_role,'gestor'::app_role,'master'::app_role)
         OR EXISTS (SELECT 1 FROM public.instance_agents ia
                     WHERE ia.instance_id = _instance_id AND ia.user_id = p.id)
       );
    IF COALESCE(_ok, false) THEN RETURN _candidate; END IF;
  END IF;

  SELECT p.id INTO _next
    FROM public.profiles p
   WHERE p.company_id = _company_id
     AND COALESCE(p.is_active, true) = true
     AND COALESCE(p.is_online, false) = true
     AND p.role IN ('agente'::app_role,'admin'::app_role,'gestor'::app_role,'master'::app_role)
     AND (
       NOT _has_instance_links
       OR p.role IN ('admin'::app_role,'gestor'::app_role,'master'::app_role)
       OR EXISTS (SELECT 1 FROM public.instance_agents ia
                   WHERE ia.instance_id = _instance_id AND ia.user_id = p.id)
     )
     AND (_candidate IS NULL OR p.id <> _candidate)
   ORDER BY p.last_seen DESC NULLS LAST
   LIMIT 1;

  RETURN _next;
END;
$function$;

-- 3) pick_reopen_assignee(uuid, uuid)
CREATE OR REPLACE FUNCTION public.pick_reopen_assignee(_conversation_id uuid, _preferred_user_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _company_id uuid;
  _instance_id uuid;
  _candidate uuid;
  _has_instance_links boolean := false;
  _ok boolean := false;
  _next uuid;
BEGIN
  SELECT company_id, instance_id INTO _company_id, _instance_id
    FROM public.conversations WHERE id = _conversation_id;
  IF _company_id IS NULL THEN RETURN NULL; END IF;

  IF _instance_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.instance_agents WHERE instance_id = _instance_id)
      INTO _has_instance_links;
  END IF;

  IF _preferred_user_id IS NOT NULL THEN
    SELECT TRUE INTO _ok
      FROM public.profiles p
     WHERE p.id = _preferred_user_id
       AND p.company_id = _company_id
       AND COALESCE(p.is_active, true) = true
       AND p.role IN ('agente'::app_role,'admin'::app_role,'gestor'::app_role,'master'::app_role,'financeiro'::app_role)
       AND (
         NOT _has_instance_links
         OR p.role IN ('admin'::app_role,'gestor'::app_role,'master'::app_role)
         OR EXISTS (SELECT 1 FROM public.instance_agents ia
                     WHERE ia.instance_id = _instance_id AND ia.user_id = p.id)
       );
    IF COALESCE(_ok, false) THEN RETURN _preferred_user_id; END IF;
    _ok := false;
  END IF;

  SELECT COALESCE(assigned_to, closed_by) INTO _candidate
    FROM public.attendance_tickets
   WHERE conversation_id = _conversation_id
   ORDER BY created_at DESC LIMIT 1;

  IF _candidate IS NOT NULL THEN
    SELECT TRUE INTO _ok
      FROM public.profiles p
     WHERE p.id = _candidate
       AND p.company_id = _company_id
       AND COALESCE(p.is_active, true) = true
       AND p.role IN ('agente'::app_role,'admin'::app_role,'gestor'::app_role,'master'::app_role)
       AND (
         NOT _has_instance_links
         OR p.role IN ('admin'::app_role,'gestor'::app_role,'master'::app_role)
         OR EXISTS (SELECT 1 FROM public.instance_agents ia
                     WHERE ia.instance_id = _instance_id AND ia.user_id = p.id)
       );
    IF COALESCE(_ok, false) THEN RETURN _candidate; END IF;
    _ok := false;
  END IF;

  SELECT p.id INTO _next
    FROM public.profiles p
   WHERE p.company_id = _company_id
     AND COALESCE(p.is_active, true) = true
     AND COALESCE(p.is_online, false) = true
     AND p.role IN ('agente'::app_role,'admin'::app_role,'gestor'::app_role,'master'::app_role)
     AND (
       NOT _has_instance_links
       OR p.role IN ('admin'::app_role,'gestor'::app_role,'master'::app_role)
       OR EXISTS (SELECT 1 FROM public.instance_agents ia
                   WHERE ia.instance_id = _instance_id AND ia.user_id = p.id)
     )
   ORDER BY
     CASE p.role
       WHEN 'admin'  THEN 0
       WHEN 'gestor' THEN 1
       WHEN 'agente' THEN 2
       WHEN 'master' THEN 3
       ELSE 4
     END,
     p.last_seen DESC NULLS LAST,
     p.created_at ASC
   LIMIT 1;

  RETURN _next;
END;
$function$;

-- 4) pick_triage_assignee
CREATE OR REPLACE FUNCTION public.pick_triage_assignee(_company_id uuid, _instance_id uuid, _mode text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _candidates uuid[];
  _picked uuid;
  _last uuid;
  _idx int;
BEGIN
  IF _company_id IS NULL OR _mode NOT IN ('round_robin','least_load','online_least_load') THEN
    RETURN NULL;
  END IF;

  WITH active_users AS (
    SELECT p.id, p.is_online, p.last_seen
    FROM public.profiles p
    WHERE p.company_id = _company_id
      AND COALESCE(p.is_active, true) = true
      AND p.role IN ('agente'::app_role,'admin'::app_role,'gestor'::app_role)
  ),
  links AS (
    SELECT user_id FROM public.instance_agents
    WHERE company_id = _company_id AND instance_id = _instance_id
  ),
  filtered AS (
    SELECT id, is_online, last_seen FROM active_users
    WHERE _instance_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM links)
       OR id IN (SELECT user_id FROM links)
  )
  SELECT array_agg(id ORDER BY id) INTO _candidates FROM filtered;

  IF _candidates IS NULL OR array_length(_candidates, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  IF _mode = 'online_least_load' THEN
    WITH cand AS (
      SELECT p.id, p.is_online, p.last_seen,
             (COALESCE(p.is_online, false) OR p.last_seen > (now() - interval '10 minutes')) AS online_now
      FROM public.profiles p
      WHERE p.id = ANY(_candidates)
    ),
    pool AS (
      SELECT id FROM cand WHERE online_now
      UNION ALL
      SELECT id FROM cand
      WHERE NOT EXISTS (SELECT 1 FROM cand WHERE online_now)
    ),
    loads AS (
      SELECT pl.id,
        (SELECT count(*)::int FROM public.attendance_tickets t
           WHERE t.company_id = _company_id AND t.assigned_to = pl.id AND t.status <> 'closed') AS open_count,
        (SELECT max(t.assigned_at) FROM public.attendance_tickets t
           WHERE t.company_id = _company_id AND t.assigned_to = pl.id) AS last_assigned
      FROM pool pl
    )
    SELECT id INTO _picked
    FROM loads
    ORDER BY open_count ASC, last_assigned ASC NULLS FIRST, id ASC
    LIMIT 1;
    RETURN _picked;
  END IF;

  IF _mode = 'least_load' THEN
    SELECT u INTO _picked
    FROM unnest(_candidates) AS u
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS open_count
      FROM public.attendance_tickets t
      WHERE t.company_id = _company_id
        AND t.assigned_to = u
        AND t.status <> 'closed'
    ) cnt ON true
    ORDER BY cnt.open_count ASC NULLS FIRST, u ASC
    LIMIT 1;
    RETURN _picked;
  END IF;

  SELECT last_assigned_user_id INTO _last
  FROM public.triage_state
  WHERE company_id = _company_id AND instance_id IS NOT DISTINCT FROM _instance_id
  FOR UPDATE;

  _idx := 1;
  IF _last IS NOT NULL THEN
    FOR i IN 1..array_length(_candidates, 1) LOOP
      IF _candidates[i] = _last THEN
        _idx := (i % array_length(_candidates, 1)) + 1;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  _picked := _candidates[_idx];

  INSERT INTO public.triage_state (company_id, instance_id, last_assigned_user_id, updated_at)
  VALUES (_company_id, _instance_id, _picked, now())
  ON CONFLICT (company_id, instance_id)
  DO UPDATE SET last_assigned_user_id = EXCLUDED.last_assigned_user_id, updated_at = now();

  RETURN _picked;
END;
$function$;

-- 5) remove_team_member
CREATE OR REPLACE FUNCTION public.remove_team_member(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _caller_company uuid;
  _target_company uuid;
  _is_master boolean;
  _target_is_master boolean;
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id required'; END IF;
  IF _user_id = _caller THEN RAISE EXCEPTION 'cannot remove yourself'; END IF;

  _is_master := public.is_master(_caller);
  _caller_company := public.get_user_company_id(_caller);

  SELECT company_id INTO _target_company FROM public.profiles WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;

  _target_is_master := EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'master'::app_role
  );
  IF _target_is_master THEN RAISE EXCEPTION 'cannot remove a master user'; END IF;

  IF NOT _is_master THEN
    IF _caller_company IS NULL OR _target_company IS NULL OR _caller_company <> _target_company THEN
      RAISE EXCEPTION 'access denied';
    END IF;
    IF NOT public.has_role(_caller, 'admin'::app_role) THEN
      RAISE EXCEPTION 'access denied';
    END IF;
  END IF;

  UPDATE public.leads SET assigned_to = NULL WHERE assigned_to = _user_id;
  UPDATE public.attendance_tickets SET assigned_to = NULL
    WHERE assigned_to = _user_id AND status <> 'closed';

  DELETE FROM public.instance_agents WHERE user_id = _user_id;
  DELETE FROM public.lead_distribution_users WHERE user_id = _user_id;
  DELETE FROM public.user_roles WHERE user_id = _user_id AND role <> 'master'::app_role;

  UPDATE public.profiles
     SET company_id = NULL,
         is_active = false,
         role = 'agente'::app_role
   WHERE id = _user_id;
END;
$function$;

-- 6) Reprocessar a fila de webhooks travada pelo bug
UPDATE public.webhook_retry_queue
   SET status = 'pending',
       attempts = 0,
       next_attempt_at = now(),
       last_error = NULL,
       picked_at = NULL
 WHERE status IN ('pending','failed')
   AND last_error ILIKE '%app_role%user%';
