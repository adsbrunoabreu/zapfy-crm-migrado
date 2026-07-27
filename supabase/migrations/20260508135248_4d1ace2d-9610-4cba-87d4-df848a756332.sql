
-- 1. Enum: novos tipos de atividade
ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'lead_won';
ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'lead_lost';
ALTER TYPE public.lead_activity_type ADD VALUE IF NOT EXISTS 'lead_reopened';

-- 2. Tabela loss_reasons
CREATE TABLE IF NOT EXISTS public.loss_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loss_reasons_company_active
  ON public.loss_reasons(company_id, is_active, sort_order);

ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loss_reasons_select" ON public.loss_reasons;
CREATE POLICY "loss_reasons_select" ON public.loss_reasons
  FOR SELECT TO authenticated
  USING (public.is_master(auth.uid()) OR company_id = public.get_user_company_id(auth.uid()));

DROP POLICY IF EXISTS "loss_reasons_insert" ON public.loss_reasons;
CREATE POLICY "loss_reasons_insert" ON public.loss_reasons
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS "loss_reasons_update" ON public.loss_reasons;
CREATE POLICY "loss_reasons_update" ON public.loss_reasons
  FOR UPDATE TO authenticated
  USING (public.is_master(auth.uid()) OR company_id = public.get_user_company_id(auth.uid()))
  WITH CHECK (
    public.is_master(auth.uid())
    OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_active(company_id))
  );

DROP POLICY IF EXISTS "loss_reasons_delete" ON public.loss_reasons;
CREATE POLICY "loss_reasons_delete" ON public.loss_reasons
  FOR DELETE TO authenticated
  USING (public.is_master(auth.uid()) OR company_id = public.get_user_company_id(auth.uid()));

CREATE TRIGGER trg_loss_reasons_updated_at
  BEFORE UPDATE ON public.loss_reasons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed para empresas existentes
INSERT INTO public.loss_reasons (company_id, label, sort_order)
SELECT c.id, x.label, x.ord
FROM public.companies c
CROSS JOIN (VALUES
  ('Preço', 1),
  ('Sem orçamento', 2),
  ('Concorrência', 3),
  ('Sem fit', 4),
  ('Timing', 5),
  ('Sem retorno', 6)
) AS x(label, ord)
ON CONFLICT DO NOTHING;

-- 3. Colunas em leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS loss_reason_id uuid REFERENCES public.loss_reasons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS loss_reason_text text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 4. Trigger de mudança de status (Ganho/Perdido/Reaberto)
CREATE OR REPLACE FUNCTION public.leads_status_change_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_action public.lead_activity_type;
  v_desc text;
  v_meta jsonb;
  v_reason_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- nada a fazer aqui, lead_created é registrado em outro lugar
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Preenche/limpa campos de fechamento
  IF NEW.status IN ('won','lost') AND OLD.status NOT IN ('won','lost') THEN
    NEW.closed_at := now();
    NEW.closed_by := COALESCE(NEW.closed_by, v_user);
    IF NEW.status = 'won' THEN
      NEW.loss_reason_id := NULL;
      NEW.loss_reason_text := NULL;
    END IF;
  ELSIF NEW.status NOT IN ('won','lost') AND OLD.status IN ('won','lost') THEN
    NEW.closed_at := NULL;
    NEW.closed_by := NULL;
    NEW.loss_reason_id := NULL;
    NEW.loss_reason_text := NULL;
  END IF;

  -- Define ação
  IF NEW.status = 'won' THEN
    v_action := 'lead_won';
    v_desc := 'Lead marcado como Ganho';
  ELSIF NEW.status = 'lost' THEN
    v_action := 'lead_lost';
    v_desc := 'Lead marcado como Perdido';
  ELSIF OLD.status IN ('won','lost') THEN
    v_action := 'lead_reopened';
    v_desc := 'Lead reaberto';
  ELSE
    RETURN NEW; -- mudanças entre estados intermediários não geram won/lost
  END IF;

  IF NEW.loss_reason_id IS NOT NULL THEN
    SELECT label INTO v_reason_label FROM public.loss_reasons WHERE id = NEW.loss_reason_id;
  END IF;

  v_meta := jsonb_build_object(
    'from', OLD.status,
    'to', NEW.status,
    'value', NEW.value,
    'reason_id', NEW.loss_reason_id,
    'reason_label', v_reason_label,
    'reason_text', NEW.loss_reason_text
  );

  INSERT INTO public.lead_activities (company_id, lead_id, user_id, action_type, description, metadata)
  VALUES (NEW.company_id, NEW.id, v_user, v_action, v_desc, v_meta);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_status_change_log ON public.leads;
CREATE TRIGGER trg_leads_status_change_log
  BEFORE UPDATE OF status ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_status_change_log();
