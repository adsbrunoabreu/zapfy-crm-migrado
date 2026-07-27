
-- 1) Permitir eventos sem ticket (transferência em conversa sem ticket)
ALTER TABLE public.attendance_ticket_events
  ALTER COLUMN ticket_id DROP NOT NULL;

-- 2) Nova função de visibilidade baseada em conversation.assigned_to e ticket.assigned_to
CREATE OR REPLACE FUNCTION public.user_can_view_conversation_v2(_user_id uuid, _conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _conv RECORD;
  _ticket_assignee uuid;
BEGIN
  IF _user_id IS NULL OR _conversation_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_master(_user_id) THEN
    RETURN true;
  END IF;

  SELECT company_id, instance_id, lead_id, assigned_to
    INTO _conv
    FROM public.conversations
   WHERE id = _conversation_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF _conv.company_id <> public.get_user_company_id(_user_id) THEN
    RETURN false;
  END IF;

  -- Admin/gestor da empresa: enxergam tudo
  IF public.is_company_admin(_user_id) OR public.is_company_manager(_user_id) THEN
    RETURN true;
  END IF;

  -- Precisa ter acesso ao canal/instância
  IF NOT public.user_has_instance_access(_user_id, _conv.instance_id) THEN
    RETURN false;
  END IF;

  -- Conversa atribuída a alguém -> só esse agente
  IF _conv.assigned_to IS NOT NULL THEN
    RETURN _conv.assigned_to = _user_id;
  END IF;

  -- Sem assignee na conversa: cair em ticket ativo (não fechado)
  SELECT assigned_to INTO _ticket_assignee
    FROM public.attendance_tickets
   WHERE conversation_id = _conversation_id
     AND status NOT IN ('closed','awaiting_rating')
   ORDER BY created_at DESC
   LIMIT 1;

  IF _ticket_assignee IS NOT NULL THEN
    RETURN _ticket_assignee = _user_id;
  END IF;

  -- Triagem (sem assignee em nenhum lado): visível para todos os agentes com acesso à instância
  RETURN true;
END;
$$;

-- 3) Repontar policies para a v2
DROP POLICY IF EXISTS "Users can view assigned conversations" ON public.conversations;
CREATE POLICY "Users can view assigned conversations"
  ON public.conversations FOR SELECT
  USING (public.user_can_view_conversation_v2(auth.uid(), id));

DROP POLICY IF EXISTS "Users can view assigned messages" ON public.chat_messages;
CREATE POLICY "Users can view assigned messages"
  ON public.chat_messages FOR SELECT
  USING (
    public.is_master(auth.uid())
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        conversation_id IS NULL
        OR public.user_can_view_conversation_v2(auth.uid(), conversation_id)
      )
    )
  );

-- 4) Padronizar evento de transferência com notes em JSON (from/to/actor/reason)
CREATE OR REPLACE FUNCTION public.transfer_attendance_ticket(_ticket_id uuid, _to_user_id uuid, _reason text DEFAULT NULL::text)
RETURNS attendance_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _ticket public.attendance_tickets;
  _company_id uuid;
  _allow_transfer boolean;
  _from_user uuid;
  _from_name text;
  _to_name text;
  _actor_name text;
  _notes_json text;
BEGIN
  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ticket not found'; END IF;

  _company_id := public.get_user_company_id(auth.uid());
  IF _ticket.company_id <> _company_id AND NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE((general->>'allow_transfer')::boolean, true) INTO _allow_transfer
    FROM public.attendance_settings WHERE company_id = _ticket.company_id;
  IF NOT COALESCE(_allow_transfer, true) THEN
    RAISE EXCEPTION 'Transfers are disabled';
  END IF;

  _from_user := _ticket.assigned_to;
  SELECT name INTO _from_name FROM public.profiles WHERE id = _from_user;
  SELECT name INTO _to_name FROM public.profiles WHERE id = _to_user_id;
  SELECT name INTO _actor_name FROM public.profiles WHERE id = auth.uid();

  _notes_json := json_build_object(
    'from_user_id', _from_user,
    'from_name', _from_name,
    'to_user_id', _to_user_id,
    'to_name', _to_name,
    'actor_user_id', auth.uid(),
    'actor_name', _actor_name,
    'reason', _reason
  )::text;

  -- Sinaliza para o trigger de conversa não duplicar o log
  PERFORM set_config('app.skip_conv_assignee_log','1', true);

  UPDATE public.attendance_tickets
     SET assigned_to = _to_user_id,
         assigned_at = now(),
         status = CASE WHEN status = 'closed' THEN 'reopened'::ticket_status ELSE 'in_progress'::ticket_status END
   WHERE id = _ticket_id;

  -- Espelha imediatamente no campo da conversa (caso o trigger de sync esteja desligado)
  IF _ticket.conversation_id IS NOT NULL THEN
    UPDATE public.conversations
       SET assigned_to = _to_user_id, assigned_at = now()
     WHERE id = _ticket.conversation_id;
  END IF;

  INSERT INTO public.attendance_ticket_assignments
    (ticket_id, company_id, from_user_id, to_user_id, transferred_by, reason, mode)
  VALUES (_ticket_id, _ticket.company_id, _from_user, _to_user_id, auth.uid(), _reason, 'manual');

  INSERT INTO public.attendance_ticket_events
    (company_id, ticket_id, conversation_id, event_type, actor_user_id, actor_name, reason, notes)
  VALUES (_ticket.company_id, _ticket.id, _ticket.conversation_id,
          CASE WHEN _from_user IS NULL THEN 'assigned' ELSE 'transferred' END,
          auth.uid(), _actor_name, _reason, _notes_json);

  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  RETURN _ticket;
END;
$$;

-- 5) Trigger: registrar transferência quando o assignee da conversa muda diretamente
CREATE OR REPLACE FUNCTION public.log_conversation_assignee_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from_name text;
  _to_name text;
  _actor uuid := auth.uid();
  _actor_name text;
  _notes_json text;
  _evt text;
BEGIN
  -- Pulamos se a mudança veio do RPC transfer_attendance_ticket
  IF COALESCE(current_setting('app.skip_conv_assignee_log', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF COALESCE(OLD.assigned_to::text,'') = COALESCE(NEW.assigned_to::text,'') THEN
    RETURN NEW;
  END IF;

  SELECT name INTO _from_name FROM public.profiles WHERE id = OLD.assigned_to;
  SELECT name INTO _to_name FROM public.profiles WHERE id = NEW.assigned_to;
  SELECT name INTO _actor_name FROM public.profiles WHERE id = _actor;

  _evt := CASE
    WHEN OLD.assigned_to IS NULL AND NEW.assigned_to IS NOT NULL THEN 'assigned'
    WHEN OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS NULL THEN 'unassigned'
    ELSE 'transferred'
  END;

  _notes_json := json_build_object(
    'from_user_id', OLD.assigned_to,
    'from_name', _from_name,
    'to_user_id', NEW.assigned_to,
    'to_name', _to_name,
    'actor_user_id', _actor,
    'actor_name', _actor_name,
    'source', 'conversation'
  )::text;

  INSERT INTO public.attendance_ticket_events
    (company_id, ticket_id, conversation_id, event_type, actor_user_id, actor_name, notes)
  VALUES (NEW.company_id, NULL, NEW.id, _evt, _actor, _actor_name, _notes_json);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_conversation_assignee_change ON public.conversations;
CREATE TRIGGER trg_log_conversation_assignee_change
AFTER UPDATE OF assigned_to ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.log_conversation_assignee_change();
