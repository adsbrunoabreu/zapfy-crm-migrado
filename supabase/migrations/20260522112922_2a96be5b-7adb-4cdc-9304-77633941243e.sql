
-- 1) Atomic unread bump
CREATE OR REPLACE FUNCTION public.bump_conversation_unread(_conversation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.conversations
     SET unread_count = COALESCE(unread_count, 0) + 1
   WHERE id = _conversation_id;
$$;

REVOKE EXECUTE ON FUNCTION public.bump_conversation_unread(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.bump_conversation_unread(uuid) TO authenticated, service_role;

-- 2) pick_reopen_assignee com _preferred_user_id opcional
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
  IF _company_id IS NULL THEN RETURN NULL; END IF;

  IF _instance_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.instance_agents WHERE instance_id = _instance_id
    ) INTO _has_instance_links;
  END IF;

  -- Helper inline para validar candidato
  IF _preferred_user_id IS NOT NULL THEN
    SELECT TRUE INTO _ok FROM public.profiles p
     WHERE p.id = _preferred_user_id
       AND p.company_id = _company_id
       AND COALESCE(p.is_active, true) = true
       AND (
         NOT _has_instance_links
         OR p.role IN ('company_admin','master')
         OR EXISTS (SELECT 1 FROM public.instance_agents ia
                     WHERE ia.instance_id = _instance_id AND ia.user_id = p.id)
       );
    IF COALESCE(_ok, false) THEN
      RETURN _preferred_user_id;
    END IF;
    _ok := false;
  END IF;

  -- Último candidato do histórico de tickets
  SELECT COALESCE(assigned_to, closed_by)
    INTO _candidate
    FROM public.attendance_tickets
   WHERE conversation_id = _conversation_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF _candidate IS NOT NULL THEN
    SELECT TRUE INTO _ok FROM public.profiles p
     WHERE p.id = _candidate
       AND p.company_id = _company_id
       AND COALESCE(p.is_active, true) = true
       AND COALESCE(p.is_online, false) = true
       AND (
         NOT _has_instance_links
         OR p.role IN ('company_admin','master')
         OR EXISTS (SELECT 1 FROM public.instance_agents ia
                     WHERE ia.instance_id = _instance_id AND ia.user_id = p.id)
       );
    IF COALESCE(_ok, false) THEN
      RETURN _candidate;
    END IF;
  END IF;

  -- Próximo atendente online elegível
  SELECT p.id INTO _next
    FROM public.profiles p
   WHERE p.company_id = _company_id
     AND COALESCE(p.is_active, true) = true
     AND COALESCE(p.is_online, false) = true
     AND p.role IN ('user','company_admin','master')
     AND (
       NOT _has_instance_links
       OR p.role IN ('company_admin','master')
       OR EXISTS (SELECT 1 FROM public.instance_agents ia
                   WHERE ia.instance_id = _instance_id AND ia.user_id = p.id)
     )
     AND (_candidate IS NULL OR p.id <> _candidate)
   ORDER BY p.last_seen DESC NULLS LAST
   LIMIT 1;

  RETURN _next;
END;
$$;

-- 3) Trigger: reabre + cria/atribui ticket para inbound E outbound
CREATE OR REPLACE FUNCTION public.reopen_conversation_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv RECORD;
  _ticket public.attendance_tickets;
  _assignee uuid;
  _preferred uuid;
  _is_outbound boolean := COALESCE(NEW.from_me, false);
  _auth_uid uuid := auth.uid();
  _new_ticket_id uuid;
BEGIN
  SELECT id, company_id, lead_id, phone, contact_name, closed_at
    INTO _conv
    FROM public.conversations
   WHERE id = NEW.conversation_id;

  IF _conv.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Reabre conversa se estava fechada
  IF _conv.closed_at IS NOT NULL THEN
    UPDATE public.conversations
       SET closed_at = NULL
     WHERE id = _conv.id;
  END IF;

  -- Outbound: preferir o autor (auth.uid). Inbound: NULL.
  IF _is_outbound AND _auth_uid IS NOT NULL THEN
    _preferred := _auth_uid;
  END IF;

  -- Último ticket da conversa
  SELECT * INTO _ticket
    FROM public.attendance_tickets
   WHERE conversation_id = _conv.id
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    -- Nenhum ticket ainda: cria um já atribuído
    _assignee := public.pick_reopen_assignee(_conv.id, _preferred);

    INSERT INTO public.attendance_tickets
      (company_id, conversation_id, lead_id, contact_phone, contact_name,
       status, assigned_to, assigned_at, priority)
    VALUES
      (_conv.company_id, _conv.id, _conv.lead_id, _conv.phone, _conv.contact_name,
       'open'::ticket_status, _assignee,
       CASE WHEN _assignee IS NOT NULL THEN now() ELSE NULL END,
       'normal')
    RETURNING id INTO _new_ticket_id;

    INSERT INTO public.attendance_ticket_events
      (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
    VALUES
      (_conv.company_id, _new_ticket_id, _conv.id, 'created', _auth_uid,
       CASE WHEN _is_outbound THEN 'auto_outbound' ELSE 'auto_inbound' END);

    IF _assignee IS NOT NULL THEN
      INSERT INTO public.attendance_ticket_events
        (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
      VALUES
        (_conv.company_id, _new_ticket_id, _conv.id, 'assigned', _assignee, 'auto_assign');
    END IF;

    RETURN NEW;
  END IF;

  -- Existe ticket: reabrir se estava closed/awaiting_rating
  IF _ticket.status IN ('closed','awaiting_rating') THEN
    _assignee := public.pick_reopen_assignee(_conv.id, _preferred);

    UPDATE public.attendance_tickets
       SET status = 'open'::ticket_status,
           reopened_at = now(),
           closed_at = NULL,
           closed_by = NULL,
           close_reason = NULL,
           close_notes = NULL,
           rating_deadline = NULL,
           assigned_to = COALESCE(_assignee, assigned_to),
           assigned_at = CASE
             WHEN _assignee IS NOT NULL AND _assignee IS DISTINCT FROM assigned_to
               THEN now()
             ELSE assigned_at
           END
     WHERE id = _ticket.id;

    INSERT INTO public.attendance_ticket_events
      (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
    VALUES
      (_ticket.company_id, _ticket.id, _conv.id, 'reopened', _auth_uid,
       CASE WHEN _is_outbound THEN 'auto_outbound' ELSE 'auto_inbound' END);

    IF _assignee IS NOT NULL AND _assignee IS DISTINCT FROM _ticket.assigned_to THEN
      INSERT INTO public.attendance_ticket_assignments
        (ticket_id, company_id, from_user_id, to_user_id, transferred_by, reason, mode)
      VALUES
        (_ticket.id, _ticket.company_id, _ticket.assigned_to, _assignee, NULL,
         CASE WHEN _is_outbound THEN 'auto_outbound' ELSE 'auto_inbound' END,
         'auto_reopen');

      INSERT INTO public.attendance_ticket_events
        (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
      VALUES
        (_ticket.company_id, _ticket.id, _conv.id, 'assigned', _assignee, 'auto_reopen');
    END IF;

  -- Ticket aberto, mas sem atendente: atribuir
  ELSIF _ticket.assigned_to IS NULL THEN
    _assignee := public.pick_reopen_assignee(_conv.id, _preferred);
    IF _assignee IS NOT NULL THEN
      UPDATE public.attendance_tickets
         SET assigned_to = _assignee,
             assigned_at = now()
       WHERE id = _ticket.id;

      INSERT INTO public.attendance_ticket_assignments
        (ticket_id, company_id, from_user_id, to_user_id, transferred_by, reason, mode)
      VALUES
        (_ticket.id, _ticket.company_id, NULL, _assignee, NULL, 'auto_assign', 'auto_reopen');

      INSERT INTO public.attendance_ticket_events
        (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
      VALUES
        (_ticket.company_id, _ticket.id, _conv.id, 'assigned', _assignee, 'auto_assign');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
