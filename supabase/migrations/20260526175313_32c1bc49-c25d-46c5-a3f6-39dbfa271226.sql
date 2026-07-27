
-- 1) Atualiza função BEFORE para também usar contacts.name quando não há lead vinculado
CREATE OR REPLACE FUNCTION public.sync_conversation_name_from_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  -- Prioridade 1: lead
  IF NEW.lead_id IS NOT NULL THEN
    SELECT name INTO v_name FROM public.leads WHERE id = NEW.lead_id;
    IF v_name IS NOT NULL AND v_name <> '' THEN
      NEW.contact_name := v_name;
      RETURN NEW;
    END IF;
  END IF;

  -- Prioridade 2: contato
  IF NEW.contact_id IS NOT NULL THEN
    SELECT name INTO v_name FROM public.contacts WHERE id = NEW.contact_id;
    IF v_name IS NOT NULL AND v_name <> '' THEN
      NEW.contact_name := v_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Recriar trigger incluindo contact_id na lista de colunas observadas
DROP TRIGGER IF EXISTS trg_sync_conversation_name_from_lead ON public.conversations;
CREATE TRIGGER trg_sync_conversation_name_from_lead
BEFORE INSERT OR UPDATE OF contact_name, lead_id, contact_id
ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.sync_conversation_name_from_lead();

-- 3) Propagar mudanças em contacts.name para conversations
CREATE OR REPLACE FUNCTION public.propagate_contact_name_to_conversations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS NULL OR NEW.name = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.name IS NOT DISTINCT FROM NEW.name THEN
    RETURN NEW;
  END IF;

  UPDATE public.conversations
     SET contact_name = NEW.name
   WHERE contact_id = NEW.id
     AND lead_id IS NULL                         -- lead tem prioridade
     AND COALESCE(contact_name, '') <> NEW.name;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_contact_name_to_conversations ON public.contacts;
CREATE TRIGGER trg_propagate_contact_name_to_conversations
AFTER UPDATE OF name ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.propagate_contact_name_to_conversations();

-- 4) Backfill imediato das conversas inconsistentes
UPDATE public.conversations c
   SET contact_name = ct.name
  FROM public.contacts ct
 WHERE c.contact_id = ct.id
   AND c.lead_id IS NULL
   AND ct.name IS NOT NULL AND ct.name <> ''
   AND COALESCE(c.contact_name, '') <> ct.name;
