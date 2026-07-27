
CREATE OR REPLACE FUNCTION public.pick_triage_assignee(
  _company_id uuid,
  _instance_id uuid,
  _mode text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      AND p.role IN ('user','company_admin')
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
    -- Prefere online (is_online OR last_seen nos últimos 10min)
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

  -- round_robin
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
$$;

GRANT EXECUTE ON FUNCTION public.pick_triage_assignee(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.auto_triage_on_conversation_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings record;
  _mode text;
  _assignee uuid;
  _prefix text;
  _next_number int;
  _code text;
  _exists boolean;
BEGIN
  SELECT tickets INTO _settings
  FROM public.attendance_settings
  WHERE company_id = NEW.company_id;

  -- Default novo: online_least_load (mesmo se não houver settings)
  _mode := COALESCE(_settings.tickets->>'assignment_mode', 'online_least_load');
  IF _mode NOT IN ('round_robin','least_load','online_least_load') THEN
    RETURN NEW; -- manual ou outro: sem triagem automática
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.attendance_tickets
    WHERE conversation_id = NEW.id AND status <> 'closed'
  ) INTO _exists;
  IF _exists THEN RETURN NEW; END IF;

  _assignee := public.pick_triage_assignee(NEW.company_id, NEW.instance_id, _mode);

  IF _assignee IS NULL THEN
    RETURN NEW;
  END IF;

  _prefix := COALESCE(_settings.tickets->>'prefix', 'ATD');
  _next_number := COALESCE((_settings.tickets->>'next_number')::int, 1);
  _code := _prefix || '-' || lpad(_next_number::text, 5, '0');

  INSERT INTO public.attendance_tickets (
    company_id, ticket_number, ticket_code, conversation_id, lead_id,
    contact_phone, contact_name, channel, status, assigned_to, assigned_at, created_by
  ) VALUES (
    NEW.company_id, _next_number, _code, NEW.id, NEW.lead_id,
    NEW.phone, NEW.contact_name, COALESCE(NEW.provider, 'evolution'), 'open', _assignee, now(), _assignee
  );

  IF _settings.tickets IS NOT NULL THEN
    UPDATE public.attendance_settings
    SET tickets = jsonb_set(tickets, '{next_number}', to_jsonb(_next_number + 1))
    WHERE company_id = NEW.company_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auto_triage failed: %', SQLERRM;
  RETURN NEW;
END;
$$;
