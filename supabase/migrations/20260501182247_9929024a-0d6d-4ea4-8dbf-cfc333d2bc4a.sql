
-- ============================================
-- TABELA: ai_addon_pricing (preços padrão geridos pelo Master)
-- ============================================
CREATE TABLE public.ai_addon_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  addon_slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  monthly_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  included_messages INT NOT NULL DEFAULT 0,
  overage_price_per_message NUMERIC(10,4) NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_addon_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view pricing"
ON public.ai_addon_pricing FOR SELECT TO authenticated USING (true);

CREATE POLICY "Masters manage pricing"
ON public.ai_addon_pricing FOR ALL TO authenticated
USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

CREATE TRIGGER trg_ai_addon_pricing_updated
BEFORE UPDATE ON public.ai_addon_pricing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed do add-on padrão de Agente IA
INSERT INTO public.ai_addon_pricing (addon_slug, display_name, monthly_price, included_messages, overage_price_per_message, description)
VALUES ('ai_agent', 'Agente IA de Atendimento', 197.00, 5000, 0.04,
        'Pré-atendimento e qualificação automática via IA. Inclui 5.000 mensagens/mês. Excedente cobrado por mensagem.');

-- ============================================
-- TABELA: company_addons (contratos por empresa)
-- ============================================
CREATE TABLE public.company_addons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL,
  addon_slug TEXT NOT NULL,
  monthly_price NUMERIC(10,2) NOT NULL,
  included_messages INT NOT NULL DEFAULT 0,
  overage_price_per_message NUMERIC(10,4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deactivated_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, addon_slug)
);

CREATE INDEX idx_company_addons_company ON public.company_addons(company_id) WHERE is_active = true;

ALTER TABLE public.company_addons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins view own addons"
ON public.company_addons FOR SELECT TO authenticated
USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Masters manage all addons"
ON public.company_addons FOR ALL TO authenticated
USING (is_master(auth.uid())) WITH CHECK (is_master(auth.uid()));

CREATE TRIGGER trg_company_addons_updated
BEFORE UPDATE ON public.company_addons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ai_agent_runs: novas colunas de billing/métrica
-- ============================================
ALTER TABLE public.ai_agent_runs
  ADD COLUMN IF NOT EXISTS messages_consumed INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_brl NUMERIC(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS had_audio BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ai_runs_company_created ON public.ai_agent_runs(company_id, created_at DESC);

-- ============================================
-- FUNÇÃO: uso do add-on em um período
-- ============================================
CREATE OR REPLACE FUNCTION public.get_ai_addon_usage(
  _company_id UUID,
  _period_start TIMESTAMPTZ DEFAULT date_trunc('month', now()),
  _period_end TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cid UUID;
  _addon RECORD;
  _total_msgs INT;
  _total_cost NUMERIC;
  _total_runs INT;
  _avg_latency NUMERIC;
  _transferred INT;
  _qualified INT;
  _audios INT;
  _overage INT;
  _overage_cost NUMERIC;
BEGIN
  -- Auth
  IF is_master(auth.uid()) THEN
    _cid := COALESCE(_company_id, get_user_company_id(auth.uid()));
  ELSE
    _cid := get_user_company_id(auth.uid());
    IF NOT is_company_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    IF _company_id IS NOT NULL AND _company_id <> _cid THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  SELECT * INTO _addon FROM public.company_addons
  WHERE company_id = _cid AND addon_slug = 'ai_agent' AND is_active = true
  LIMIT 1;

  SELECT
    COALESCE(SUM(messages_consumed), 0),
    COALESCE(SUM(cost_brl), 0),
    COUNT(*),
    COALESCE(AVG(latency_ms), 0),
    COUNT(*) FILTER (WHERE tools_called::text ILIKE '%transfer_to_human%'),
    COUNT(*) FILTER (WHERE tools_called::text ILIKE '%qualify_lead%'),
    COUNT(*) FILTER (WHERE had_audio = true)
  INTO _total_msgs, _total_cost, _total_runs, _avg_latency, _transferred, _qualified, _audios
  FROM public.ai_agent_runs
  WHERE company_id = _cid
    AND created_at >= _period_start AND created_at <= _period_end
    AND status = 'completed';

  _overage := GREATEST(0, _total_msgs - COALESCE(_addon.included_messages, 0));
  _overage_cost := _overage * COALESCE(_addon.overage_price_per_message, 0);

  RETURN jsonb_build_object(
    'company_id', _cid,
    'period_start', _period_start,
    'period_end', _period_end,
    'addon_active', _addon.id IS NOT NULL,
    'monthly_price', COALESCE(_addon.monthly_price, 0),
    'included_messages', COALESCE(_addon.included_messages, 0),
    'overage_price_per_message', COALESCE(_addon.overage_price_per_message, 0),
    'messages_consumed', _total_msgs,
    'overage_messages', _overage,
    'overage_cost_brl', ROUND(_overage_cost, 2),
    'projected_invoice_addon_total', ROUND(COALESCE(_addon.monthly_price, 0) + _overage_cost, 2),
    'total_runs', _total_runs,
    'qualified_leads', _qualified,
    'transferred_to_human', _transferred,
    'audios_transcribed', _audios,
    'avg_latency_ms', ROUND(_avg_latency, 0),
    'estimated_llm_cost_brl', ROUND(_total_cost, 4)
  );
END;
$$;

-- ============================================
-- Função helper para sincronizar ai_agent_enabled em companies
-- com a presença de company_addons ativos
-- ============================================
CREATE OR REPLACE FUNCTION public.sync_company_ai_addon()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.addon_slug = 'ai_agent' THEN
      UPDATE public.companies SET ai_agent_enabled = false WHERE id = OLD.company_id;
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.addon_slug = 'ai_agent' THEN
    UPDATE public.companies
    SET ai_agent_enabled = NEW.is_active
    WHERE id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_company_ai_addon
AFTER INSERT OR UPDATE OR DELETE ON public.company_addons
FOR EACH ROW EXECUTE FUNCTION public.sync_company_ai_addon();
