
-- 1) Helper: escolhe atendente para reabertura
CREATE OR REPLACE FUNCTION public.pick_reopen_assignee(_conversation_id uuid)
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

  -- Último candidato: assigned_to do último ticket; se nulo, closed_by.
  SELECT COALESCE(assigned_to, closed_by)
    INTO _candidate
    FROM public.attendance_tickets
   WHERE conversation_id = _conversation_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF _instance_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.instance_agents WHERE instance_id = _instance_id
    ) INTO _has_instance_links;
  END IF;

  -- Candidato preferido precisa estar online, ativo e elegível à instância.
  IF _candidate IS NOT NULL THEN
    SELECT TRUE
      INTO _ok
      FROM public.profiles p
     WHERE p.id = _candidate
       AND p.company_id = _company_id
       AND COALESCE(p.is_active, true) = true
       AND COALESCE(p.is_online, false) = true
       AND (
         NOT _has_instance_links
         OR p.role IN ('company_admin','master')
         OR EXISTS (
           SELECT 1 FROM public.instance_agents ia
            WHERE ia.instance_id = _instance_id AND ia.user_id = p.id
         )
       );
    IF COALESCE(_ok, false) THEN
      RETURN _candidate;
    END IF;
  END IF;

  -- Fallback: próximo atendente online elegível à instância.
  SELECT p.id
    INTO _next
    FROM public.profiles p
   WHERE p.company_id = _company_id
     AND COALESCE(p.is_active, true) = true
     AND COALESCE(p.is_online, false) = true
     AND p.role IN ('user','company_admin','master')
     AND (
       NOT _has_instance_links
       OR p.role IN ('company_admin','master')
       OR EXISTS (
         SELECT 1 FROM public.instance_agents ia
          WHERE ia.instance_id = _instance_id AND ia.user_id = p.id
       )
     )
     -- Não devolve o mesmo candidato se ele estava offline
     AND (_candidate IS NULL OR p.id <> _candidate)
   ORDER BY p.last_seen DESC NULLS LAST
   LIMIT 1;

  RETURN _next;
END;
$$;

-- 2) Substitui a função do trigger: só reabre em mensagem inbound, e
-- reatribui o ticket ao último atendente (ou próximo online).
CREATE OR REPLACE FUNCTION public.reopen_conversation_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _was_closed boolean := false;
  _company_id uuid;
  _ticket public.attendance_tickets;
  _assignee uuid;
BEGIN
  -- Somente reage a mensagens do contato (inbound).
  IF COALESCE(NEW.from_me, false) THEN
    RETURN NEW;
  END IF;

  -- Tenta limpar closed_at; se nada mudou, conversa já estava aberta.
  WITH upd AS (
    UPDATE public.conversations
       SET closed_at = NULL
     WHERE id = NEW.conversation_id
       AND closed_at IS NOT NULL
    RETURNING company_id
  )
  SELECT company_id INTO _company_id FROM upd LIMIT 1;

  IF _company_id IS NULL THEN
    RETURN NEW;
  END IF;

  _was_closed := true;

  -- Reabre/reatribui o último ticket, se houver e estiver fechado/aguardando avaliação.
  SELECT * INTO _ticket
    FROM public.attendance_tickets
   WHERE conversation_id = NEW.conversation_id
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND AND _ticket.status IN ('closed','awaiting_rating') THEN
    _assignee := public.pick_reopen_assignee(NEW.conversation_id);

    UPDATE public.attendance_tickets
       SET status = 'open'::ticket_status,
           reopened_at = now(),
           closed_at = NULL,
           closed_by = NULL,
           close_reason = NULL,
           close_notes = NULL,
           rating_deadline = NULL,
           assigned_to = _assignee,
           assigned_at = CASE WHEN _assignee IS NOT NULL THEN now() ELSE assigned_at END
     WHERE id = _ticket.id;

    INSERT INTO public.attendance_ticket_events
      (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
    VALUES
      (_ticket.company_id, _ticket.id, NEW.conversation_id, 'reopened', NULL, 'auto_inbound');

    IF _assignee IS NOT NULL AND _assignee IS DISTINCT FROM _ticket.assigned_to THEN
      INSERT INTO public.attendance_ticket_assignments
        (ticket_id, company_id, from_user_id, to_user_id, transferred_by, reason, mode)
      VALUES
        (_ticket.id, _ticket.company_id, _ticket.assigned_to, _assignee, NULL, 'auto_inbound', 'auto_reopen');

      INSERT INTO public.attendance_ticket_events
        (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason)
      VALUES
        (_ticket.company_id, _ticket.id, NEW.conversation_id, 'assigned', _assignee, 'auto_reopen');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger já aponta para reopen_conversation_on_new_message; não precisa recriar.
