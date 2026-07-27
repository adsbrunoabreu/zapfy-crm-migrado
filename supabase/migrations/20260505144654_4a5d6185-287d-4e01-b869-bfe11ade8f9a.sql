-- Tabela de histórico (event sourcing leve) por lead
CREATE TABLE IF NOT EXISTS public.lead_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_user_id uuid,
  actor_name text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_history_lead ON public.lead_history (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_history_company ON public.lead_history (company_id, created_at DESC);

ALTER TABLE public.lead_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own lead history"
ON public.lead_history FOR SELECT TO authenticated
USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

-- Sem INSERT/UPDATE/DELETE direto (apenas triggers SECURITY DEFINER)

-- Helper para nome do ator
CREATE OR REPLACE FUNCTION public._lead_history_actor_name(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(full_name, email) FROM profiles WHERE id = _uid LIMIT 1;
$$;

-- Trigger: mudanças em leads
CREATE OR REPLACE FUNCTION public.tg_lead_history_on_lead_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_name text := public._lead_history_actor_name(_actor);
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
    VALUES (NEW.company_id, NEW.id, 'name_changed', _actor, _actor_name,
      jsonb_build_object('from', OLD.name, 'to', NEW.name));
  END IF;

  IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
    INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
    VALUES (NEW.company_id, NEW.id, 'assigned_changed', _actor, _actor_name,
      jsonb_build_object(
        'from', OLD.assigned_to,
        'to', NEW.assigned_to,
        'from_name', public._lead_history_actor_name(OLD.assigned_to),
        'to_name', public._lead_history_actor_name(NEW.assigned_to)
      ));
  END IF;

  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
    VALUES (NEW.company_id, NEW.id, 'stage_changed', _actor, _actor_name,
      jsonb_build_object('from_stage_id', OLD.stage_id, 'to_stage_id', NEW.stage_id));
  END IF;

  IF NEW.pipeline_id IS DISTINCT FROM OLD.pipeline_id THEN
    INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
    VALUES (NEW.company_id, NEW.id, 'pipeline_changed', _actor, _actor_name,
      jsonb_build_object('from_pipeline_id', OLD.pipeline_id, 'to_pipeline_id', NEW.pipeline_id));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
    VALUES (NEW.company_id, NEW.id, 'status_changed', _actor, _actor_name,
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_history_lead_update ON public.leads;
CREATE TRIGGER trg_lead_history_lead_update
AFTER UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_history_on_lead_update();

-- Trigger: criação de lead
CREATE OR REPLACE FUNCTION public.tg_lead_history_on_lead_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
BEGIN
  INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
  VALUES (NEW.company_id, NEW.id, 'lead_created', _actor, public._lead_history_actor_name(_actor),
    jsonb_build_object('source', NEW.source));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_history_lead_insert ON public.leads;
CREATE TRIGGER trg_lead_history_lead_insert
AFTER INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_history_on_lead_insert();

-- Trigger: tags adicionadas/removidas
CREATE OR REPLACE FUNCTION public.tg_lead_history_on_lead_tag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_name text := public._lead_history_actor_name(_actor);
  _tag_name text;
  _tag_id uuid;
  _company uuid;
  _lead uuid;
  _event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    _tag_id := NEW.tag_id; _lead := NEW.lead_id; _event := 'tag_added';
  ELSE
    _tag_id := OLD.tag_id; _lead := OLD.lead_id; _event := 'tag_removed';
  END IF;

  SELECT company_id INTO _company FROM leads WHERE id = _lead;
  SELECT name INTO _tag_name FROM tags WHERE id = _tag_id;

  IF _company IS NOT NULL THEN
    INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
    VALUES (_company, _lead, _event, _actor, _actor_name,
      jsonb_build_object('tag_id', _tag_id, 'tag_name', _tag_name));
  END IF;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_lead_history_lead_tag ON public.lead_tags;
CREATE TRIGGER trg_lead_history_lead_tag
AFTER INSERT OR DELETE ON public.lead_tags
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_history_on_lead_tag();

-- Trigger: tickets abertos/fechados/transferidos
CREATE OR REPLACE FUNCTION public.tg_lead_history_on_ticket()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor uuid := auth.uid();
  _actor_name text := public._lead_history_actor_name(_actor);
BEGIN
  IF TG_OP = 'INSERT' AND NEW.lead_id IS NOT NULL THEN
    INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
    VALUES (NEW.company_id, NEW.lead_id, 'ticket_opened', _actor, _actor_name,
      jsonb_build_object('ticket_id', NEW.id, 'ticket_code', NEW.ticket_code));
  ELSIF TG_OP = 'UPDATE' AND NEW.lead_id IS NOT NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text = 'closed' THEN
      INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
      VALUES (NEW.company_id, NEW.lead_id, 'ticket_closed', _actor, _actor_name,
        jsonb_build_object('ticket_id', NEW.id, 'ticket_code', NEW.ticket_code, 'reason', NEW.close_reason));
    END IF;
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      INSERT INTO lead_history(company_id, lead_id, event_type, actor_user_id, actor_name, payload)
      VALUES (NEW.company_id, NEW.lead_id, 'ticket_transferred', _actor, _actor_name,
        jsonb_build_object(
          'ticket_id', NEW.id,
          'from', OLD.assigned_to, 'to', NEW.assigned_to,
          'from_name', public._lead_history_actor_name(OLD.assigned_to),
          'to_name', public._lead_history_actor_name(NEW.assigned_to)
        ));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_history_ticket ON public.attendance_tickets;
CREATE TRIGGER trg_lead_history_ticket
AFTER INSERT OR UPDATE ON public.attendance_tickets
FOR EACH ROW EXECUTE FUNCTION public.tg_lead_history_on_ticket();