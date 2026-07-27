-- Fix: pick_reopen_assignee referenciava valores legados 'user' e 'company_admin'
-- que foram removidos do enum app_role. Cast em IN(...) forçava cast text→enum e falhava,
-- bloqueando insert de chat_messages via trigger reopen_conversation_on_new_message.

CREATE OR REPLACE FUNCTION public.pick_reopen_assignee(
  _conversation_id uuid,
  _preferred_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _instance_id uuid;
  _candidate uuid;
  _has_instance_links boolean := false;
  _ok boolean := false;
  _next uuid;
BEGIN
  SELECT company_id, instance_id
    INTO _company_id, _instance_id
    FROM public.conversations
   WHERE id = _conversation_id;

  IF _company_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _instance_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.instance_agents
       WHERE instance_id = _instance_id
    ) INTO _has_instance_links;
  END IF;

  IF _preferred_user_id IS NOT NULL THEN
    SELECT TRUE
      INTO _ok
      FROM public.profiles p
     WHERE p.id = _preferred_user_id
       AND p.company_id = _company_id
       AND COALESCE(p.is_active, true) = true
       AND p.role IN ('agente'::app_role,'admin'::app_role,'gestor'::app_role,'master'::app_role,'financeiro'::app_role)
       AND (
         NOT _has_instance_links
         OR p.role IN ('admin'::app_role,'gestor'::app_role,'master'::app_role)
         OR EXISTS (
           SELECT 1
             FROM public.instance_agents ia
            WHERE ia.instance_id = _instance_id
              AND ia.user_id = p.id
         )
       );

    IF COALESCE(_ok, false) THEN
      RETURN _preferred_user_id;
    END IF;
    _ok := false;
  END IF;

  SELECT COALESCE(assigned_to, closed_by)
    INTO _candidate
    FROM public.attendance_tickets
   WHERE conversation_id = _conversation_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF _candidate IS NOT NULL THEN
    SELECT TRUE
      INTO _ok
      FROM public.profiles p
     WHERE p.id = _candidate
       AND p.company_id = _company_id
       AND COALESCE(p.is_active, true) = true
       AND p.role IN ('agente'::app_role,'admin'::app_role,'gestor'::app_role,'master'::app_role,'financeiro'::app_role)
       AND (
         NOT _has_instance_links
         OR p.role IN ('admin'::app_role,'gestor'::app_role,'master'::app_role)
         OR EXISTS (
           SELECT 1
             FROM public.instance_agents ia
            WHERE ia.instance_id = _instance_id
              AND ia.user_id = p.id
         )
       );

    IF COALESCE(_ok, false) THEN
      RETURN _candidate;
    END IF;
    _ok := false;
  END IF;

  SELECT p.id
    INTO _next
    FROM public.profiles p
   WHERE p.company_id = _company_id
     AND COALESCE(p.is_active, true) = true
     AND COALESCE(p.is_online, false) = true
     AND p.role IN ('agente'::app_role,'admin'::app_role,'gestor'::app_role,'master'::app_role,'financeiro'::app_role)
     AND (
       NOT _has_instance_links
       OR p.role IN ('admin'::app_role,'gestor'::app_role,'master'::app_role)
       OR EXISTS (
         SELECT 1
           FROM public.instance_agents ia
          WHERE ia.instance_id = _instance_id
            AND ia.user_id = p.id
       )
     )
   ORDER BY
     CASE p.role
       WHEN 'admin'::app_role THEN 0
       WHEN 'gestor'::app_role THEN 1
       WHEN 'agente'::app_role THEN 2
       WHEN 'master'::app_role THEN 3
       ELSE 4
     END,
     p.last_seen DESC NULLS LAST,
     p.created_at ASC
   LIMIT 1;

  RETURN _next;
END;
$$;