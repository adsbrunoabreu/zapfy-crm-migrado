CREATE OR REPLACE FUNCTION public.get_user_rankings(
  _period_start date,
  _period_end date
)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  avatar_url text,
  role text,
  joined_at timestamptz,
  leads_count bigint,
  value_won numeric,
  conversions_count bigint,
  responses_count bigint,
  prev_leads_count bigint,
  prev_value_won numeric,
  prev_conversions_count bigint,
  prev_responses_count bigint,
  target_leads numeric,
  target_value numeric,
  target_conversions numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_is_master boolean;
  v_period_days integer;
  v_prev_start date;
  v_prev_end date;
BEGIN
  SELECT is_master(auth.uid()) INTO v_is_master;
  SELECT company_id INTO v_company FROM profiles WHERE id = auth.uid();

  IF v_company IS NULL AND NOT COALESCE(v_is_master, false) THEN
    RETURN;
  END IF;

  v_period_days := GREATEST(1, (_period_end - _period_start) + 1);
  v_prev_end   := _period_start - INTERVAL '1 day';
  v_prev_start := v_prev_end - (v_period_days - 1) * INTERVAL '1 day';

  RETURN QUERY
  WITH members AS (
    SELECT p.id, p.full_name, p.email, p.avatar_url, p.role::text AS role, p.created_at, p.company_id
      FROM profiles p
     WHERE COALESCE(p.is_active, true) = true
       AND p.company_id = v_company
  ),
  cur_leads AS (
    SELECT l.assigned_to AS uid,
           COUNT(*) FILTER (WHERE l.created_at::date BETWEEN _period_start AND _period_end) AS leads_count,
           COUNT(*) FILTER (WHERE l.status = 'won' AND COALESCE(l.closed_at, l.updated_at)::date BETWEEN _period_start AND _period_end) AS conv_count,
           COALESCE(SUM(l.value) FILTER (WHERE l.status = 'won' AND COALESCE(l.closed_at, l.updated_at)::date BETWEEN _period_start AND _period_end), 0) AS value_won
      FROM leads l
     WHERE l.company_id = v_company
       AND l.assigned_to IS NOT NULL
     GROUP BY l.assigned_to
  ),
  prev_leads AS (
    SELECT l.assigned_to AS uid,
           COUNT(*) FILTER (WHERE l.created_at::date BETWEEN v_prev_start AND v_prev_end) AS leads_count,
           COUNT(*) FILTER (WHERE l.status = 'won' AND COALESCE(l.closed_at, l.updated_at)::date BETWEEN v_prev_start AND v_prev_end) AS conv_count,
           COALESCE(SUM(l.value) FILTER (WHERE l.status = 'won' AND COALESCE(l.closed_at, l.updated_at)::date BETWEEN v_prev_start AND v_prev_end), 0) AS value_won
      FROM leads l
     WHERE l.company_id = v_company
       AND l.assigned_to IS NOT NULL
     GROUP BY l.assigned_to
  ),
  cur_msgs AS (
    SELECT l.assigned_to AS uid, COUNT(*) AS n
      FROM chat_messages cm
      JOIN conversations c ON c.id = cm.conversation_id
      JOIN leads l         ON l.id = c.lead_id
     WHERE cm.company_id = v_company
       AND cm.from_me = true
       AND l.assigned_to IS NOT NULL
       AND COALESCE(cm.timestamp, cm.created_at)::date BETWEEN _period_start AND _period_end
     GROUP BY l.assigned_to
  ),
  prev_msgs AS (
    SELECT l.assigned_to AS uid, COUNT(*) AS n
      FROM chat_messages cm
      JOIN conversations c ON c.id = cm.conversation_id
      JOIN leads l         ON l.id = c.lead_id
     WHERE cm.company_id = v_company
       AND cm.from_me = true
       AND l.assigned_to IS NOT NULL
       AND COALESCE(cm.timestamp, cm.created_at)::date BETWEEN v_prev_start AND v_prev_end
     GROUP BY l.assigned_to
  ),
  goals AS (
    SELECT g.user_id AS uid,
           SUM(g.target_value) FILTER (WHERE g.goal_type = 'leads')       AS tgt_leads,
           SUM(g.target_value) FILTER (WHERE g.goal_type = 'value')       AS tgt_value,
           SUM(g.target_value) FILTER (WHERE g.goal_type = 'conversions') AS tgt_conv
      FROM user_goals g
     WHERE g.company_id = v_company
       AND g.period_start::date <= _period_end
       AND g.period_end::date   >= _period_start
     GROUP BY g.user_id
  )
  SELECT
    m.id,
    m.full_name,
    m.email,
    m.avatar_url,
    m.role,
    m.created_at,
    COALESCE(cl.leads_count, 0),
    COALESCE(cl.value_won, 0),
    COALESCE(cl.conv_count, 0),
    COALESCE(cmsg.n, 0),
    COALESCE(pl.leads_count, 0),
    COALESCE(pl.value_won, 0),
    COALESCE(pl.conv_count, 0),
    COALESCE(pmsg.n, 0),
    COALESCE(g.tgt_leads, 0),
    COALESCE(g.tgt_value, 0),
    COALESCE(g.tgt_conv, 0)
  FROM members m
  LEFT JOIN cur_leads  cl   ON cl.uid   = m.id
  LEFT JOIN prev_leads pl   ON pl.uid   = m.id
  LEFT JOIN cur_msgs   cmsg ON cmsg.uid = m.id
  LEFT JOIN prev_msgs  pmsg ON pmsg.uid = m.id
  LEFT JOIN goals      g    ON g.uid    = m.id;
END;
$$;