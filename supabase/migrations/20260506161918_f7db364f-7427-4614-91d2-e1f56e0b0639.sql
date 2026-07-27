
-- Tabela de eventos do ticket
CREATE TABLE public.attendance_ticket_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  ticket_id UUID NOT NULL REFERENCES public.attendance_tickets(id) ON DELETE CASCADE,
  conversation_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('opened','closed','reopened')),
  actor_user_id UUID,
  actor_name TEXT,
  reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_ticket_events_conv ON public.attendance_ticket_events(conversation_id, created_at);
CREATE INDEX idx_attendance_ticket_events_ticket ON public.attendance_ticket_events(ticket_id, created_at);
CREATE INDEX idx_attendance_ticket_events_company ON public.attendance_ticket_events(company_id);

ALTER TABLE public.attendance_ticket_events ENABLE ROW LEVEL SECURITY;

-- RLS: usuários da empresa podem ler; insert apenas via trigger (system)
CREATE POLICY "Company members can view ticket events"
ON public.attendance_ticket_events
FOR SELECT
USING (
  public.is_master(auth.uid())
  OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
);

CREATE POLICY "System can insert ticket events"
ON public.attendance_ticket_events
FOR INSERT
WITH CHECK (true);

-- Função de trigger: registra eventos baseado em INSERT/UPDATE de attendance_tickets
CREATE OR REPLACE FUNCTION public.log_attendance_ticket_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor UUID := auth.uid();
  _actor_name TEXT;
BEGIN
  IF _actor IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO _actor_name FROM public.profiles WHERE id = _actor LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.attendance_ticket_events (company_id, ticket_id, conversation_id, event_type, actor_user_id, actor_name, created_at)
    VALUES (NEW.company_id, NEW.id, NEW.conversation_id, 'opened', COALESCE(_actor, NEW.created_by), _actor_name, NEW.created_at);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'closed' AND COALESCE(OLD.status::text, '') <> 'closed' THEN
      INSERT INTO public.attendance_ticket_events (company_id, ticket_id, conversation_id, event_type, actor_user_id, actor_name, reason, notes, created_at)
      VALUES (NEW.company_id, NEW.id, NEW.conversation_id, 'closed', COALESCE(_actor, NEW.closed_by), _actor_name, NEW.close_reason, NEW.close_notes, COALESCE(NEW.closed_at, now()));
    ELSIF NEW.status = 'reopened' AND OLD.status::text = 'closed' THEN
      INSERT INTO public.attendance_ticket_events (company_id, ticket_id, conversation_id, event_type, actor_user_id, actor_name, created_at)
      VALUES (NEW.company_id, NEW.id, NEW.conversation_id, 'reopened', _actor, _actor_name, COALESCE(NEW.reopened_at, now()));
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_tickets_log_events_ins ON public.attendance_tickets;
CREATE TRIGGER trg_attendance_tickets_log_events_ins
AFTER INSERT ON public.attendance_tickets
FOR EACH ROW
EXECUTE FUNCTION public.log_attendance_ticket_event();

DROP TRIGGER IF EXISTS trg_attendance_tickets_log_events_upd ON public.attendance_tickets;
CREATE TRIGGER trg_attendance_tickets_log_events_upd
AFTER UPDATE OF status ON public.attendance_tickets
FOR EACH ROW
EXECUTE FUNCTION public.log_attendance_ticket_event();

-- Backfill: tickets existentes
INSERT INTO public.attendance_ticket_events (company_id, ticket_id, conversation_id, event_type, actor_user_id, created_at)
SELECT company_id, id, conversation_id, 'opened', created_by, created_at
FROM public.attendance_tickets;

INSERT INTO public.attendance_ticket_events (company_id, ticket_id, conversation_id, event_type, actor_user_id, reason, notes, created_at)
SELECT company_id, id, conversation_id, 'closed', closed_by, close_reason, close_notes, closed_at
FROM public.attendance_tickets
WHERE closed_at IS NOT NULL;

INSERT INTO public.attendance_ticket_events (company_id, ticket_id, conversation_id, event_type, created_at)
SELECT company_id, id, conversation_id, 'reopened', reopened_at
FROM public.attendance_tickets
WHERE reopened_at IS NOT NULL;
