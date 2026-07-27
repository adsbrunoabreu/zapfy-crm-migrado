
CREATE OR REPLACE FUNCTION public.prevent_closed_lead_edits()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Permite a operação apenas quando:
  --  a) lead não estava fechado, OU
  --  b) o update é a reabertura (status sai de won/lost para algo aberto)
  IF OLD.status IN ('won','lost')
     AND NEW.status IN ('won','lost') THEN
    RAISE EXCEPTION 'Lead % está marcado como % e precisa ser reaberto antes de qualquer alteração.',
      OLD.id, OLD.status
      USING ERRCODE = 'check_violation',
            HINT = 'Reabra o lead para editá-lo novamente.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_closed_lead_edits ON public.leads;

CREATE TRIGGER trg_prevent_closed_lead_edits
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  WHEN (OLD.status IN ('won','lost'))
  EXECUTE FUNCTION public.prevent_closed_lead_edits();
