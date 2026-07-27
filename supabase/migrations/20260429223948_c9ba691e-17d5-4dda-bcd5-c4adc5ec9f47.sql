-- Histórico de atribuições/transferências
CREATE TABLE IF NOT EXISTS public.attendance_ticket_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID NOT NULL REFERENCES public.attendance_tickets(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  from_user_id UUID,
  to_user_id UUID,
  transferred_by UUID,
  reason TEXT,
  mode TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_att_assignments_ticket ON public.attendance_ticket_assignments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_att_assignments_company ON public.attendance_ticket_assignments(company_id);

ALTER TABLE public.attendance_ticket_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view ticket assignments"
ON public.attendance_ticket_assignments FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "Members insert ticket assignments"
ON public.attendance_ticket_assignments FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

-- Trigger: registra mudanças de assigned_to
CREATE OR REPLACE FUNCTION public.log_ticket_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.attendance_ticket_assignments(
      ticket_id, company_id, from_user_id, to_user_id, transferred_by, mode
    ) VALUES (
      NEW.id, NEW.company_id, NULL, NEW.assigned_to, COALESCE(auth.uid(), NEW.created_by), 'initial'
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO public.attendance_ticket_assignments(
      ticket_id, company_id, from_user_id, to_user_id, transferred_by, mode
    ) VALUES (
      NEW.id, NEW.company_id, OLD.assigned_to, NEW.assigned_to, auth.uid(), 'transfer'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_ticket_assignment ON public.attendance_tickets;
CREATE TRIGGER trg_log_ticket_assignment
AFTER INSERT OR UPDATE OF assigned_to ON public.attendance_tickets
FOR EACH ROW EXECUTE FUNCTION public.log_ticket_assignment_change();

-- Atribuição automática: substitui a função de criação para honrar assignment_mode
CREATE OR REPLACE FUNCTION public.create_attendance_ticket(
  _conversation_id UUID,
  _lead_id UUID,
  _contact_phone TEXT,
  _contact_name TEXT,
  _priority TEXT DEFAULT NULL,
  _category TEXT DEFAULT NULL,
  _assigned_to UUID DEFAULT NULL
)
RETURNS public.attendance_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id UUID;
  _settings RECORD;
  _prefix TEXT;
  _next INT;
  _code TEXT;
  _ticket public.attendance_tickets;
  _priority_color TEXT;
  _final_priority TEXT;
  _mode TEXT;
  _max_concurrent INT;
  _auto_assignee UUID;
BEGIN
  _company_id := public.get_user_company_id(auth.uid());
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'No company';
  END IF;
  IF NOT public.is_company_active(_company_id) THEN
    RAISE EXCEPTION 'Company inactive';
  END IF;

  SELECT * INTO _settings FROM public.attendance_settings
  WHERE company_id = _company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.attendance_settings (company_id) VALUES (_company_id)
    RETURNING * INTO _settings;
  END IF;

  _prefix := COALESCE(_settings.tickets->>'prefix', 'ATD');
  _next := COALESCE((_settings.tickets->>'next_number')::INT, 1);
  _code := _prefix || '-' || lpad(_next::TEXT, 5, '0');
  _mode := COALESCE(_settings.tickets->>'assignment_mode', 'manual');
  _max_concurrent := COALESCE((_settings.general->>'max_concurrent_per_agent')::INT, 9999);

  UPDATE public.attendance_settings
  SET tickets = jsonb_set(tickets, '{next_number}', to_jsonb(_next + 1))
  WHERE company_id = _company_id;

  -- Atribuição automática se aplicável
  IF _assigned_to IS NULL AND _mode <> 'manual' THEN
    IF _mode = 'load_balanced' THEN
      -- Menor carga: agente ativo da empresa com menos tickets em aberto
      SELECT p.id INTO _auto_assignee
      FROM public.profiles p
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS open_count
        FROM public.attendance_tickets t
        WHERE t.company_id = _company_id
          AND t.assigned_to = p.id
          AND t.status IN ('open','in_progress','reopened')
      ) c ON TRUE
      WHERE p.company_id = _company_id
        AND p.is_active = true
        AND COALESCE(c.open_count, 0) < _max_concurrent
      ORDER BY COALESCE(c.open_count, 0) ASC, p.created_at ASC
      LIMIT 1;
    ELSE
      -- round_robin: próximo agente após o último atribuído
      WITH agents AS (
        SELECT p.id, p.created_at,
               row_number() OVER (ORDER BY p.created_at, p.id) AS rn,
               COUNT(*) OVER () AS total
        FROM public.profiles p
        WHERE p.company_id = _company_id AND p.is_active = true
      ), last_assign AS (
        SELECT to_user_id FROM public.attendance_ticket_assignments
        WHERE company_id = _company_id AND to_user_id IS NOT NULL
        ORDER BY created_at DESC LIMIT 1
      ), next_idx AS (
        SELECT CASE
          WHEN (SELECT to_user_id FROM last_assign) IS NULL THEN 1
          ELSE ((SELECT rn FROM agents WHERE id = (SELECT to_user_id FROM last_assign)) % (SELECT total FROM agents LIMIT 1)) + 1
        END AS rn
      )
      SELECT a.id INTO _auto_assignee
      FROM agents a
      WHERE a.rn = (SELECT rn FROM next_idx)
        AND (
          SELECT COUNT(*) FROM public.attendance_tickets t
          WHERE t.company_id = _company_id AND t.assigned_to = a.id
            AND t.status IN ('open','in_progress','reopened')
        ) < _max_concurrent;
    END IF;
    _assigned_to := _auto_assignee;
  END IF;

  _final_priority := COALESCE(_priority, 'Média');
  SELECT (p->>'color') INTO _priority_color
  FROM jsonb_array_elements(_settings.tickets->'priorities') p
  WHERE p->>'name' = _final_priority
  LIMIT 1;

  INSERT INTO public.attendance_tickets (
    company_id, ticket_number, ticket_code, conversation_id, lead_id,
    contact_phone, contact_name, priority, priority_color, category,
    assigned_to, assigned_at, status, created_by, last_message_at
  ) VALUES (
    _company_id, _next, _code, _conversation_id, _lead_id,
    _contact_phone, _contact_name, _final_priority, _priority_color, _category,
    _assigned_to,
    CASE WHEN _assigned_to IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN _assigned_to IS NOT NULL THEN 'in_progress'::ticket_status ELSE 'open'::ticket_status END,
    auth.uid(),
    now()
  )
  RETURNING * INTO _ticket;

  RETURN _ticket;
END;
$$;

-- Função para transferência manual com motivo
CREATE OR REPLACE FUNCTION public.transfer_attendance_ticket(
  _ticket_id UUID,
  _to_user_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS public.attendance_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ticket public.attendance_tickets;
  _company_id UUID;
  _allow_transfer BOOLEAN;
BEGIN
  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ticket not found';
  END IF;

  _company_id := public.get_user_company_id(auth.uid());
  IF _ticket.company_id <> _company_id AND NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COALESCE((general->>'allow_transfer')::BOOLEAN, true) INTO _allow_transfer
  FROM public.attendance_settings WHERE company_id = _ticket.company_id;

  IF NOT COALESCE(_allow_transfer, true) THEN
    RAISE EXCEPTION 'Transfers are disabled';
  END IF;

  UPDATE public.attendance_tickets
  SET assigned_to = _to_user_id,
      assigned_at = now(),
      status = CASE WHEN status = 'closed' THEN 'reopened'::ticket_status ELSE 'in_progress'::ticket_status END
  WHERE id = _ticket_id;

  -- Atualizar motivo no último registro do histórico (criado pelo trigger)
  IF _reason IS NOT NULL THEN
    UPDATE public.attendance_ticket_assignments
    SET reason = _reason
    WHERE id = (
      SELECT id FROM public.attendance_ticket_assignments
      WHERE ticket_id = _ticket_id ORDER BY created_at DESC LIMIT 1
    );
  END IF;

  SELECT * INTO _ticket FROM public.attendance_tickets WHERE id = _ticket_id;
  RETURN _ticket;
END;
$$;