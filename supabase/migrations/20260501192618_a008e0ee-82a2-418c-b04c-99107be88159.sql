-- ============================================================
-- Message Templates + Follow-up Sequences
-- ============================================================

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  category text,
  body text NOT NULL,
  media_url text,
  media_mimetype text,
  media_filename text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_msg_templates_company ON public.message_templates(company_id);
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view templates" ON public.message_templates FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Admins insert templates" ON public.message_templates FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id));
CREATE POLICY "Admins update templates" ON public.message_templates FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id));
CREATE POLICY "Admins delete templates" ON public.message_templates FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));
CREATE POLICY "Masters manage templates" ON public.message_templates FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));
CREATE TRIGGER trg_msg_templates_updated BEFORE UPDATE ON public.message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$ BEGIN
  CREATE TYPE public.sequence_trigger_type AS ENUM ('manual','lead_created','stage_changed','tag_added');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.message_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  trigger_type public.sequence_trigger_type NOT NULL DEFAULT 'manual',
  trigger_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  business_hours_only boolean NOT NULL DEFAULT false,
  stop_on_reply boolean NOT NULL DEFAULT true,
  stop_on_won_lost boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_seq_company ON public.message_sequences(company_id);
CREATE INDEX IF NOT EXISTS idx_msg_seq_trigger ON public.message_sequences(trigger_type) WHERE is_active = true;
ALTER TABLE public.message_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view sequences" ON public.message_sequences FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Admins insert sequences" ON public.message_sequences FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id));
CREATE POLICY "Admins update sequences" ON public.message_sequences FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(company_id));
CREATE POLICY "Admins delete sequences" ON public.message_sequences FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));
CREATE POLICY "Masters manage sequences" ON public.message_sequences FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));
CREATE TRIGGER trg_msg_sequences_updated BEFORE UPDATE ON public.message_sequences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.message_sequence_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.message_sequences(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  template_id uuid REFERENCES public.message_templates(id) ON DELETE SET NULL,
  body_override text,
  delay_minutes int NOT NULL DEFAULT 0,
  media_url text,
  media_mimetype text,
  media_filename text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_msg_seq_steps_seq ON public.message_sequence_steps(sequence_id, position);
ALTER TABLE public.message_sequence_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View steps via sequence" ON public.message_sequence_steps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.message_sequences s WHERE s.id = sequence_id
    AND (is_master(auth.uid()) OR s.company_id = get_user_company_id(auth.uid()))));
CREATE POLICY "Admins manage steps" ON public.message_sequence_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.message_sequences s WHERE s.id = sequence_id
    AND s.company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(s.company_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.message_sequences s WHERE s.id = sequence_id
    AND s.company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()) AND is_company_active(s.company_id)));
CREATE POLICY "Masters manage steps" ON public.message_sequence_steps FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));
CREATE TRIGGER trg_msg_seq_steps_updated BEFORE UPDATE ON public.message_sequence_steps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.message_sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES public.message_sequences(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  current_step int NOT NULL DEFAULT 0,
  next_run_at timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','canceled')),
  cancel_reason text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_enrollment_per_lead
  ON public.message_sequence_enrollments(sequence_id, lead_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_enroll_due ON public.message_sequence_enrollments(next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_enroll_company ON public.message_sequence_enrollments(company_id);
CREATE INDEX IF NOT EXISTS idx_enroll_lead ON public.message_sequence_enrollments(lead_id);
ALTER TABLE public.message_sequence_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view enrollments" ON public.message_sequence_enrollments FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));
CREATE POLICY "Members insert enrollments" ON public.message_sequence_enrollments FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id));
CREATE POLICY "Members update enrollments" ON public.message_sequence_enrollments FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id))
  WITH CHECK (company_id = get_user_company_id(auth.uid()) AND is_company_active(company_id));
CREATE POLICY "Admins delete enrollments" ON public.message_sequence_enrollments FOR DELETE TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));
CREATE POLICY "Masters manage enrollments" ON public.message_sequence_enrollments FOR ALL TO authenticated
  USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));
CREATE TRIGGER trg_enrollments_updated BEFORE UPDATE ON public.message_sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPC render_template
CREATE OR REPLACE FUNCTION public.render_template(_body text, _lead_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_stage_name text;
  v_assignee_name text;
  v_first_name text;
  v_value_fmt text;
  v_result text := COALESCE(_body, '');
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = _lead_id;
  IF NOT FOUND THEN RETURN v_result; END IF;
  SELECT name INTO v_stage_name FROM public.pipeline_stages WHERE id = v_lead.stage_id;
  SELECT full_name INTO v_assignee_name FROM public.profiles WHERE id = v_lead.assigned_to;
  v_first_name := split_part(COALESCE(v_lead.name, ''), ' ', 1);
  v_value_fmt := CASE WHEN v_lead.value IS NULL THEN ''
    ELSE 'R$ ' || to_char(v_lead.value, 'FM999G999G990D00') END;
  v_result := replace(v_result, '{{nome}}', COALESCE(v_lead.name, ''));
  v_result := replace(v_result, '{{primeiro_nome}}', v_first_name);
  v_result := replace(v_result, '{{empresa}}', COALESCE(v_lead.company_name, ''));
  v_result := replace(v_result, '{{telefone}}', COALESCE(v_lead.phone, ''));
  v_result := replace(v_result, '{{email}}', COALESCE(v_lead.email, ''));
  v_result := replace(v_result, '{{valor}}', v_value_fmt);
  v_result := replace(v_result, '{{etapa}}', COALESCE(v_stage_name, ''));
  v_result := replace(v_result, '{{atendente}}', COALESCE(v_assignee_name, ''));
  v_result := replace(v_result, '{{cidade}}', COALESCE(v_lead.city, ''));
  v_result := replace(v_result, '{{estado}}', COALESCE(v_lead.state, ''));
  v_result := replace(v_result, '{{data}}', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'));
  v_result := regexp_replace(v_result, '\{\{[^}]+\}\}', '', 'g');
  RETURN v_result;
END;
$$;

-- Helper enroll
CREATE OR REPLACE FUNCTION public.enroll_lead_in_sequence(_sequence_id uuid, _lead_id uuid, _started_by uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_seq public.message_sequences%ROWTYPE;
  v_lead_company uuid;
  v_first_delay int := 0;
  v_enrollment_id uuid;
BEGIN
  SELECT * INTO v_seq FROM public.message_sequences WHERE id = _sequence_id AND is_active = true;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT company_id INTO v_lead_company FROM public.leads WHERE id = _lead_id;
  IF v_lead_company IS NULL OR v_lead_company <> v_seq.company_id THEN RETURN NULL; END IF;
  SELECT delay_minutes INTO v_first_delay FROM public.message_sequence_steps
    WHERE sequence_id = _sequence_id ORDER BY position ASC LIMIT 1;
  IF v_first_delay IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.message_sequence_enrollments(company_id, sequence_id, lead_id, current_step, next_run_at, started_by)
  VALUES (v_seq.company_id, _sequence_id, _lead_id, 0, now() + make_interval(mins => v_first_delay), _started_by)
  ON CONFLICT (sequence_id, lead_id) WHERE status = 'active' DO NOTHING
  RETURNING id INTO v_enrollment_id;
  RETURN v_enrollment_id;
END;
$$;

-- Triggers
CREATE OR REPLACE FUNCTION public.trg_seq_on_lead_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT s.id, s.trigger_config FROM public.message_sequences s
    WHERE s.is_active = true AND s.trigger_type = 'lead_created' AND s.company_id = NEW.company_id
  LOOP
    IF (r.trigger_config ? 'source') AND COALESCE(NEW.source,'') <> (r.trigger_config->>'source') THEN CONTINUE; END IF;
    IF (r.trigger_config ? 'pipeline_id') AND NEW.pipeline_id::text <> (r.trigger_config->>'pipeline_id') THEN CONTINUE; END IF;
    PERFORM public.enroll_lead_in_sequence(r.id, NEW.id, NEW.created_by);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_seq_after_insert ON public.leads;
CREATE TRIGGER trg_lead_seq_after_insert AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_seq_on_lead_created();

CREATE OR REPLACE FUNCTION public.trg_seq_on_stage_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF NEW.stage_id IS NULL OR NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN RETURN NEW; END IF;
  FOR r IN
    SELECT s.id FROM public.message_sequences s
    WHERE s.is_active = true AND s.trigger_type = 'stage_changed' AND s.company_id = NEW.company_id
      AND (s.trigger_config->>'stage_id') = NEW.stage_id::text
  LOOP
    PERFORM public.enroll_lead_in_sequence(r.id, NEW.id, NULL);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_lead_seq_after_stage ON public.leads;
CREATE TRIGGER trg_lead_seq_after_stage AFTER UPDATE OF stage_id ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_seq_on_stage_changed();

CREATE OR REPLACE FUNCTION public.trg_seq_on_tag_added()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_company uuid;
BEGIN
  SELECT company_id INTO v_company FROM public.leads WHERE id = NEW.lead_id;
  IF v_company IS NULL THEN RETURN NEW; END IF;
  FOR r IN
    SELECT s.id FROM public.message_sequences s
    WHERE s.is_active = true AND s.trigger_type = 'tag_added' AND s.company_id = v_company
      AND (s.trigger_config->>'tag_id') = NEW.tag_id::text
  LOOP
    PERFORM public.enroll_lead_in_sequence(r.id, NEW.lead_id, NULL);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_seq_after_tag_added ON public.lead_tags;
CREATE TRIGGER trg_seq_after_tag_added AFTER INSERT ON public.lead_tags
  FOR EACH ROW EXECUTE FUNCTION public.trg_seq_on_tag_added();

CREATE OR REPLACE FUNCTION public.trg_seq_cancel_on_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_lead_id uuid;
BEGIN
  IF NEW.from_me = true THEN RETURN NEW; END IF;
  SELECT lead_id INTO v_lead_id FROM public.conversations WHERE id = NEW.conversation_id;
  IF v_lead_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.message_sequence_enrollments e
  SET status='canceled', cancel_reason='client_replied', completed_at=now()
  WHERE e.lead_id = v_lead_id AND e.status='active'
    AND EXISTS (SELECT 1 FROM public.message_sequences s WHERE s.id = e.sequence_id AND s.stop_on_reply = true);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_seq_cancel_on_reply ON public.chat_messages;
CREATE TRIGGER trg_seq_cancel_on_reply AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_seq_cancel_on_reply();

CREATE OR REPLACE FUNCTION public.trg_seq_cancel_on_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status::text NOT IN ('won','lost') THEN RETURN NEW; END IF;
  IF OLD.status::text = NEW.status::text THEN RETURN NEW; END IF;
  UPDATE public.message_sequence_enrollments e
  SET status='canceled', cancel_reason='lead_'||NEW.status::text, completed_at=now()
  WHERE e.lead_id = NEW.id AND e.status='active'
    AND EXISTS (SELECT 1 FROM public.message_sequences s WHERE s.id = e.sequence_id AND s.stop_on_won_lost = true);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_seq_cancel_on_status ON public.leads;
CREATE TRIGGER trg_seq_cancel_on_status AFTER UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trg_seq_cancel_on_status();