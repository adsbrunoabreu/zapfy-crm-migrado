INSERT INTO public.ai_addon_pricing (addon_slug, display_name, description, monthly_price, included_messages, overage_price_per_message, is_active)
VALUES ('automations', 'Automações de Atendimento', 'Templates de mensagens, fluxos de follow-up e gatilhos automáticos para leads.', 97.00, 0, 0, true)
ON CONFLICT (addon_slug) DO NOTHING;

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS automations_enabled boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_automations_enabled(_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT automations_enabled FROM public.companies WHERE id = _company_id), false);
$$;

CREATE OR REPLACE FUNCTION public.sync_company_addons()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.addon_slug = 'ai_agent' THEN
      UPDATE public.companies SET ai_agent_enabled = false WHERE id = OLD.company_id;
    ELSIF OLD.addon_slug = 'automations' THEN
      UPDATE public.companies SET automations_enabled = false WHERE id = OLD.company_id;
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.addon_slug = 'ai_agent' THEN
    UPDATE public.companies SET ai_agent_enabled = NEW.is_active WHERE id = NEW.company_id;
  ELSIF NEW.addon_slug = 'automations' THEN
    UPDATE public.companies SET automations_enabled = NEW.is_active WHERE id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_company_ai_addon ON public.company_addons;
DROP TRIGGER IF EXISTS trg_sync_company_addons ON public.company_addons;
CREATE TRIGGER trg_sync_company_addons
AFTER INSERT OR UPDATE OR DELETE ON public.company_addons
FOR EACH ROW EXECUTE FUNCTION public.sync_company_addons();

UPDATE public.companies c
SET automations_enabled = COALESCE((
  SELECT is_active FROM public.company_addons ca
  WHERE ca.company_id = c.id AND ca.addon_slug = 'automations' LIMIT 1
), false);

DROP POLICY IF EXISTS "Members insert templates when enabled" ON public.message_templates;
DROP POLICY IF EXISTS "Members update templates when enabled" ON public.message_templates;
CREATE POLICY "Members insert templates when enabled" ON public.message_templates
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id) AND is_automations_enabled(company_id));
CREATE POLICY "Members update templates when enabled" ON public.message_templates
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id) AND is_automations_enabled(company_id))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id) AND is_automations_enabled(company_id));

DROP POLICY IF EXISTS "Members insert sequences when enabled" ON public.message_sequences;
DROP POLICY IF EXISTS "Members update sequences when enabled" ON public.message_sequences;
CREATE POLICY "Members insert sequences when enabled" ON public.message_sequences
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id) AND is_automations_enabled(company_id));
CREATE POLICY "Members update sequences when enabled" ON public.message_sequences
  FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id) AND is_automations_enabled(company_id))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id) AND is_automations_enabled(company_id));

DROP POLICY IF EXISTS "Members insert steps when enabled" ON public.message_sequence_steps;
DROP POLICY IF EXISTS "Members update steps when enabled" ON public.message_sequence_steps;
CREATE POLICY "Members insert steps when enabled" ON public.message_sequence_steps
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.message_sequences s WHERE s.id = sequence_id AND s.company_id = get_user_company_id(auth.uid()) AND is_company_active(s.company_id) AND is_automations_enabled(s.company_id)));
CREATE POLICY "Members update steps when enabled" ON public.message_sequence_steps
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.message_sequences s WHERE s.id = sequence_id AND s.company_id = get_user_company_id(auth.uid()) AND is_company_active(s.company_id) AND is_automations_enabled(s.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.message_sequences s WHERE s.id = sequence_id AND s.company_id = get_user_company_id(auth.uid()) AND is_automations_enabled(s.company_id)));