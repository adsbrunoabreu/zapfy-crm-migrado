-- Enum de status dos tickets
DO $$ BEGIN
  CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'closed', 'reopened');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tabela principal
CREATE TABLE IF NOT EXISTS public.attendance_tickets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  ticket_number INTEGER NOT NULL,
  ticket_code TEXT NOT NULL,
  conversation_id UUID,
  lead_id UUID,
  contact_phone TEXT,
  contact_name TEXT,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'Média',
  priority_color TEXT,
  category TEXT,
  assigned_to UUID,
  assigned_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  close_reason TEXT,
  close_notes TEXT,
  reopened_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, ticket_number)
);

CREATE INDEX IF NOT EXISTS idx_att_tickets_company ON public.attendance_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_att_tickets_conversation ON public.attendance_tickets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_att_tickets_assigned ON public.attendance_tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_att_tickets_status ON public.attendance_tickets(company_id, status);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_att_tickets_updated_at ON public.attendance_tickets;
CREATE TRIGGER trg_att_tickets_updated_at
BEFORE UPDATE ON public.attendance_tickets
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Função para criar ticket consumindo numeração de attendance_settings
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
BEGIN
  _company_id := public.get_user_company_id(auth.uid());
  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'No company';
  END IF;
  IF NOT public.is_company_active(_company_id) THEN
    RAISE EXCEPTION 'Company inactive';
  END IF;

  -- Lock and read settings
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

  -- Increment counter
  UPDATE public.attendance_settings
  SET tickets = jsonb_set(tickets, '{next_number}', to_jsonb(_next + 1))
  WHERE company_id = _company_id;

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

-- RLS
ALTER TABLE public.attendance_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view company tickets"
ON public.attendance_tickets FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR company_id = get_user_company_id(auth.uid())
);

CREATE POLICY "Members insert company tickets"
ON public.attendance_tickets FOR INSERT TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

CREATE POLICY "Assignee or admin can update tickets"
ON public.attendance_tickets FOR UPDATE TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
  AND (is_company_admin(auth.uid()) OR assigned_to = auth.uid() OR assigned_to IS NULL)
)
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

CREATE POLICY "Admins delete tickets"
ON public.attendance_tickets FOR DELETE TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_admin(auth.uid())
);

CREATE POLICY "Masters manage all tickets"
ON public.attendance_tickets FOR ALL TO authenticated
USING (is_master(auth.uid()))
WITH CHECK (is_master(auth.uid()));