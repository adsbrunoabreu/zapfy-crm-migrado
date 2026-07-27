-- 1) Trigger em conversations: ao inserir/atualizar, se houver lead vinculado com nome, usa o nome do lead
CREATE OR REPLACE FUNCTION public.sync_conversation_name_from_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_name text;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    SELECT name INTO v_lead_name FROM public.leads WHERE id = NEW.lead_id;
    IF v_lead_name IS NOT NULL AND v_lead_name <> '' THEN
      NEW.contact_name := v_lead_name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_conversation_name_from_lead ON public.conversations;
CREATE TRIGGER trg_sync_conversation_name_from_lead
BEFORE INSERT OR UPDATE OF contact_name, lead_id ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.sync_conversation_name_from_lead();

-- 2) Trigger em leads: ao mudar o nome, propaga para todas as conversas vinculadas
CREATE OR REPLACE FUNCTION public.propagate_lead_name_to_conversations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name AND NEW.name IS NOT NULL AND NEW.name <> '' THEN
    UPDATE public.conversations
    SET contact_name = NEW.name
    WHERE lead_id = NEW.id
      AND (contact_name IS DISTINCT FROM NEW.name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_propagate_lead_name_to_conversations ON public.leads;
CREATE TRIGGER trg_propagate_lead_name_to_conversations
AFTER UPDATE OF name ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.propagate_lead_name_to_conversations();