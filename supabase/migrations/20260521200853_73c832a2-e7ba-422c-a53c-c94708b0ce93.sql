-- Auto-distribute new leads using lead_distribution_settings rules
CREATE OR REPLACE FUNCTION public.trg_auto_distribute_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
  v_enabled boolean;
BEGIN
  -- Only act on brand-new leads without an assignee
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check if distribution rules are enabled for this company
  SELECT enabled INTO v_enabled
    FROM public.lead_distribution_settings
   WHERE company_id = NEW.company_id
   LIMIT 1;

  IF COALESCE(v_enabled, false) = false THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_url || '/functions/v1/distribute-leads',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'x-internal-key', v_key
    ),
    body := jsonb_build_object(
      'company_id', NEW.company_id,
      'lead_id', NEW.id
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- never block lead creation
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_distribute_lead ON public.leads;
CREATE TRIGGER trg_auto_distribute_lead
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trg_auto_distribute_lead();