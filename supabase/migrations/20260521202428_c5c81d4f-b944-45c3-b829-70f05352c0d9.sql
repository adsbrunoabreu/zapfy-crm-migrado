-- =====================================================================
-- DRE (Demonstrativo de Resultado do Exercício) — Schema enterprise
-- =====================================================================

-- 1) Enum de seções do DRE
DO $$ BEGIN
  CREATE TYPE public.dre_section AS ENUM (
    'receita_consultas','receita_procedimentos','receita_cirurgias',
    'receita_memberships','receita_convenios','receita_particular','receita_outros',
    'deducao_glosas','deducao_cancelamentos','deducao_estornos','deducao_descontos',
    'custo_comissao_medica','custo_materiais','custo_laboratorio','custo_equipamentos',
    'custo_apis','custo_infraestrutura','custo_whatsapp','custo_ia',
    'despesa_administrativo','despesa_comercial','despesa_marketing','despesa_rh',
    'despesa_tecnologia','despesa_atendimento','despesa_financeiro',
    'resultado_juros','resultado_tarifas','resultado_iof','resultado_antecipacao',
    'impostos'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Coluna dre_section em financial_categories
ALTER TABLE public.financial_categories
  ADD COLUMN IF NOT EXISTS dre_section public.dre_section;

CREATE INDEX IF NOT EXISTS ix_fin_cat_dre_section
  ON public.financial_categories (company_id, dre_section)
  WHERE dre_section IS NOT NULL;

-- 3) Heurística de classificação automática (usa nome + flags)
CREATE OR REPLACE FUNCTION public.classify_dre_section(
  _name text, _kind text, _is_direct_cost boolean, _is_operational boolean
) RETURNS public.dre_section
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE n text := lower(coalesce(_name, ''));
BEGIN
  IF _kind = 'income' THEN
    IF n ~ 'consulta'              THEN RETURN 'receita_consultas';
    ELSIF n ~ 'cirurgi'            THEN RETURN 'receita_cirurgias';
    ELSIF n ~ 'procedim'           THEN RETURN 'receita_procedimentos';
    ELSIF n ~ 'membership|plano|assinatur' THEN RETURN 'receita_memberships';
    ELSIF n ~ 'conv[eê]nio|unimed|amil|bradesco|sulamerica|hapvida|notredame' THEN RETURN 'receita_convenios';
    ELSIF n ~ 'particular'         THEN RETURN 'receita_particular';
    ELSIF n ~ 'glosa'              THEN RETURN 'deducao_glosas';
    ELSIF n ~ 'cancelament'        THEN RETURN 'deducao_cancelamentos';
    ELSIF n ~ 'estorno|chargeback' THEN RETURN 'deducao_estornos';
    ELSIF n ~ 'desconto'           THEN RETURN 'deducao_descontos';
    ELSE RETURN 'receita_outros';
    END IF;
  ELSE
    -- expense
    IF n ~ 'glosa'                 THEN RETURN 'deducao_glosas';
    ELSIF n ~ 'comiss[aã]o.*m[eé]dic|honor[aá]rio' THEN RETURN 'custo_comissao_medica';
    ELSIF n ~ 'material|insumo'    THEN RETURN 'custo_materiais';
    ELSIF n ~ 'laborat[oó]rio|exame' THEN RETURN 'custo_laboratorio';
    ELSIF n ~ 'equipament'         THEN RETURN 'custo_equipamentos';
    ELSIF n ~ 'whatsapp|evolution' THEN RETURN 'custo_whatsapp';
    ELSIF n ~ '(\b|_)ia(\b|_)|openai|anthropic|gemini|llm|agente.?ia' THEN RETURN 'custo_ia';
    ELSIF n ~ 'api|integra[cç][aã]o' THEN RETURN 'custo_apis';
    ELSIF n ~ 'hosp|cloud|aws|servidor|infra' THEN RETURN 'custo_infraestrutura';
    ELSIF n ~ 'marketing|ads|m[ií]dia|google ads|meta ads|facebook|instagram' THEN RETURN 'despesa_marketing';
    ELSIF n ~ 'comerc|vend' THEN RETURN 'despesa_comercial';
    ELSIF n ~ 'rh|recursos humanos|folha|sal[aá]rio|pr[oó]labore' THEN RETURN 'despesa_rh';
    ELSIF n ~ 'tecnolog|software|saas|licen[cç]a' THEN RETURN 'despesa_tecnologia';
    ELSIF n ~ 'atendiment|sac' THEN RETURN 'despesa_atendimento';
    ELSIF n ~ 'financeir|banc[aá]rio|tarifa' THEN
      IF n ~ 'juros' THEN RETURN 'resultado_juros';
      ELSIF n ~ 'tarifa' THEN RETURN 'resultado_tarifas';
      ELSIF n ~ 'iof' THEN RETURN 'resultado_iof';
      ELSIF n ~ 'antecipa' THEN RETURN 'resultado_antecipacao';
      ELSE RETURN 'despesa_financeiro';
      END IF;
    ELSIF n ~ 'juros'              THEN RETURN 'resultado_juros';
    ELSIF n ~ 'iof'                THEN RETURN 'resultado_iof';
    ELSIF n ~ 'antecipa'           THEN RETURN 'resultado_antecipacao';
    ELSIF n ~ 'imposto|tribut|iss|pis|cofins|irpj|csll|simples' THEN RETURN 'impostos';
    ELSIF _is_direct_cost          THEN RETURN 'custo_materiais';
    ELSIF _is_operational          THEN RETURN 'despesa_administrativo';
    ELSE RETURN 'despesa_administrativo';
    END IF;
  END IF;
END $$;

-- 4) Trigger: classifica automaticamente na inserção
CREATE OR REPLACE FUNCTION public.tg_financial_categories_auto_dre()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.dre_section IS NULL THEN
    NEW.dre_section := public.classify_dre_section(NEW.name, NEW.kind, NEW.is_direct_cost, NEW.is_operational);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_financial_categories_auto_dre ON public.financial_categories;
CREATE TRIGGER trg_financial_categories_auto_dre
  BEFORE INSERT OR UPDATE OF name, kind, is_direct_cost, is_operational
  ON public.financial_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_financial_categories_auto_dre();

-- Backfill
UPDATE public.financial_categories
   SET dre_section = public.classify_dre_section(name, kind, is_direct_cost, is_operational)
 WHERE dre_section IS NULL;

-- 5) Helper: garante categoria de sistema por seção (idempotente)
CREATE OR REPLACE FUNCTION public.ensure_dre_system_category(
  _company_id uuid, _name text, _kind text, _section public.dre_section,
  _is_direct_cost boolean DEFAULT false, _is_operational boolean DEFAULT true
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id
    FROM public.financial_categories
   WHERE company_id = _company_id AND name = _name
   LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.financial_categories
      (company_id, name, kind, is_direct_cost, is_operational, is_system, dre_section)
    VALUES (_company_id, _name, _kind, _is_direct_cost, _is_operational, true, _section)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- 6) Trigger appointment concluído -> financial_entry (income)
CREATE OR REPLACE FUNCTION public.tg_appointment_to_financial_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_section public.dre_section;
  v_cat_name text;
  v_category_id uuid;
  v_exists uuid;
  v_amount numeric;
BEGIN
  -- só dispara quando transiciona para concluído/realizado e há valor
  IF NEW.status NOT IN ('completed','concluida','concluído','realizado','realizada','paid','paga') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  v_amount := coalesce(NEW.price, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  -- idempotência: já existe entry para esse appointment?
  SELECT id INTO v_exists
    FROM public.financial_entries
   WHERE company_id = NEW.company_id
     AND metadata->>'source_module' = 'appointment'
     AND metadata->>'source_id' = NEW.id::text
   LIMIT 1;
  IF v_exists IS NOT NULL THEN RETURN NEW; END IF;

  -- classifica
  IF NEW.insurance_id IS NOT NULL THEN
    v_section := 'receita_convenios'; v_cat_name := 'Receita - Convênios';
  ELSIF NEW.procedure_id IS NOT NULL THEN
    v_section := 'receita_procedimentos'; v_cat_name := 'Receita - Procedimentos';
  ELSE
    v_section := 'receita_consultas'; v_cat_name := 'Receita - Consultas';
  END IF;

  v_category_id := public.ensure_dre_system_category(
    NEW.company_id, v_cat_name, 'income', v_section
  );

  INSERT INTO public.financial_entries (
    company_id, kind, category_id, lead_id, party_name,
    description, amount, due_date, paid_at, status,
    metadata, created_by
  ) VALUES (
    NEW.company_id, 'receivable', v_category_id, NEW.lead_id, NULL,
    'Atendimento médico em ' || to_char(NEW.scheduled_date, 'DD/MM/YYYY'),
    v_amount, NEW.scheduled_date::date,
    CASE WHEN NEW.payment_status IN ('paid','paga','quitada') THEN NEW.updated_at::timestamptz ELSE NULL END,
    CASE WHEN NEW.payment_status IN ('paid','paga','quitada') THEN 'paid' ELSE 'pending' END,
    jsonb_build_object(
      'source_module','appointment',
      'source_id', NEW.id::text,
      'doctor_id', NEW.doctor_id,
      'patient_id', NEW.patient_id,
      'procedure_id', NEW.procedure_id,
      'insurance_id', NEW.insurance_id,
      'facility_id', NEW.facility_id
    ),
    NULL
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_appointment_to_financial_entry ON public.medical_appointments;
CREATE TRIGGER trg_appointment_to_financial_entry
  AFTER INSERT OR UPDATE OF status, price, payment_status
  ON public.medical_appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_appointment_to_financial_entry();

-- 7) RPC: get_dre_report
CREATE OR REPLACE FUNCTION public.get_dre_report(
  _company_id uuid,
  _period_start date,
  _period_end date,
  _basis text DEFAULT 'competencia',  -- 'competencia' | 'caixa'
  _filters jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_doctor_id uuid := nullif(_filters->>'doctor_id','')::uuid;
  v_insurance_id uuid := nullif(_filters->>'insurance_id','')::uuid;
  v_facility_id uuid := nullif(_filters->>'facility_id','')::uuid;
  v_category_id uuid := nullif(_filters->>'category_id','')::uuid;
  v_cost_center_id uuid := nullif(_filters->>'cost_center_id','')::uuid;
BEGIN
  -- ACL: master ou pertencer à empresa
  IF NOT (has_role(auth.uid(),'master') OR
          EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = _company_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH base AS (
    SELECT
      fe.id,
      fe.amount,
      fe.discount,
      fe.net_amount,
      fe.paid_amount,
      fe.status,
      fc.dre_section,
      fc.name AS category_name,
      fc.id AS category_id,
      fe.due_date,
      fe.paid_at,
      fe.metadata
    FROM public.financial_entries fe
    LEFT JOIN public.financial_categories fc ON fc.id = fe.category_id
    WHERE fe.company_id = _company_id
      AND (
        (_basis = 'competencia' AND fe.due_date BETWEEN _period_start AND _period_end)
        OR
        (_basis = 'caixa' AND fe.paid_at::date BETWEEN _period_start AND _period_end)
      )
      AND (v_category_id IS NULL OR fc.id = v_category_id)
      AND (v_cost_center_id IS NULL OR fe.cost_center_id = v_cost_center_id)
      AND (v_doctor_id IS NULL OR (fe.metadata->>'doctor_id')::uuid = v_doctor_id)
      AND (v_insurance_id IS NULL OR (fe.metadata->>'insurance_id')::uuid = v_insurance_id)
      AND (v_facility_id IS NULL OR (fe.metadata->>'facility_id')::uuid = v_facility_id)
  ),
  by_section AS (
    SELECT dre_section, SUM(net_amount) AS total
    FROM base
    WHERE dre_section IS NOT NULL
    GROUP BY dre_section
  ),
  by_category AS (
    SELECT dre_section, category_id, category_name, SUM(net_amount) AS total, COUNT(*) AS qty
    FROM base
    WHERE dre_section IS NOT NULL
    GROUP BY dre_section, category_id, category_name
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('start', _period_start, 'end', _period_end, 'basis', _basis),
    'sections', (SELECT jsonb_object_agg(dre_section, total) FROM by_section),
    'categories', (SELECT jsonb_agg(jsonb_build_object(
      'section', dre_section, 'category_id', category_id,
      'category_name', category_name, 'total', total, 'qty', qty
    ) ORDER BY total DESC) FROM by_category)
  ) INTO v_result;

  RETURN coalesce(v_result, jsonb_build_object(
    'period', jsonb_build_object('start',_period_start,'end',_period_end,'basis',_basis),
    'sections','{}'::jsonb,'categories','[]'::jsonb));
END $$;

-- 8) RPC: drill-down (entries de uma categoria/seção)
CREATE OR REPLACE FUNCTION public.get_dre_drill_down(
  _company_id uuid,
  _section public.dre_section,
  _category_id uuid,
  _period_start date,
  _period_end date,
  _basis text DEFAULT 'competencia'
) RETURNS TABLE (
  id uuid, description text, amount numeric, net_amount numeric,
  due_date date, paid_at timestamptz, status text,
  category_name text, party_name text, lead_id uuid, metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'master') OR
          EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND company_id = _company_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT fe.id, fe.description, fe.amount, fe.net_amount,
         fe.due_date, fe.paid_at, fe.status,
         fc.name, fe.party_name, fe.lead_id, fe.metadata
    FROM public.financial_entries fe
    LEFT JOIN public.financial_categories fc ON fc.id = fe.category_id
   WHERE fe.company_id = _company_id
     AND fc.dre_section = _section
     AND (_category_id IS NULL OR fe.category_id = _category_id)
     AND (
       (_basis = 'competencia' AND fe.due_date BETWEEN _period_start AND _period_end)
       OR
       (_basis = 'caixa' AND fe.paid_at::date BETWEEN _period_start AND _period_end)
     )
   ORDER BY coalesce(fe.paid_at::date, fe.due_date) DESC
   LIMIT 500;
END $$;

-- 9) RPC: comparativo período atual vs anterior
CREATE OR REPLACE FUNCTION public.get_dre_comparison(
  _company_id uuid, _period_start date, _period_end date,
  _basis text DEFAULT 'competencia', _filters jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_len integer := (_period_end - _period_start) + 1;
  v_prev_start date := _period_start - v_len;
  v_prev_end date := _period_start - 1;
  v_curr jsonb;
  v_prev jsonb;
BEGIN
  v_curr := public.get_dre_report(_company_id, _period_start, _period_end, _basis, _filters);
  v_prev := public.get_dre_report(_company_id, v_prev_start, v_prev_end, _basis, _filters);
  RETURN jsonb_build_object('current', v_curr, 'previous', v_prev);
END $$;

-- 10) RPC: insights automáticos
CREATE OR REPLACE FUNCTION public.get_dre_insights(
  _company_id uuid, _period_start date, _period_end date,
  _basis text DEFAULT 'competencia', _filters jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_cmp jsonb := public.get_dre_comparison(_company_id, _period_start, _period_end, _basis, _filters);
  v_insights jsonb := '[]'::jsonb;
  v_curr_rec numeric; v_prev_rec numeric;
  v_curr_mkt numeric; v_prev_mkt numeric;
  v_curr_ebitda numeric; v_prev_ebitda numeric;
  v_delta numeric;
BEGIN
  -- Receita (soma de receita_*)
  SELECT coalesce(SUM(value::numeric),0) INTO v_curr_rec
    FROM jsonb_each_text(v_cmp->'current'->'sections')
   WHERE key LIKE 'receita_%';
  SELECT coalesce(SUM(value::numeric),0) INTO v_prev_rec
    FROM jsonb_each_text(v_cmp->'previous'->'sections')
   WHERE key LIKE 'receita_%';

  IF v_prev_rec > 0 THEN
    v_delta := round(((v_curr_rec - v_prev_rec)/v_prev_rec)*100, 1);
    IF abs(v_delta) >= 5 THEN
      v_insights := v_insights || jsonb_build_object(
        'type', CASE WHEN v_delta >= 0 THEN 'positive' ELSE 'negative' END,
        'message', 'Receita ' || CASE WHEN v_delta>=0 THEN 'cresceu ' ELSE 'caiu ' END
                   || abs(v_delta) || '% vs período anterior'
      );
    END IF;
  END IF;

  -- Marketing
  v_curr_mkt := coalesce((v_cmp->'current'->'sections'->>'despesa_marketing')::numeric,0);
  v_prev_mkt := coalesce((v_cmp->'previous'->'sections'->>'despesa_marketing')::numeric,0);
  IF v_prev_mkt > 0 THEN
    v_delta := round(((v_curr_mkt - v_prev_mkt)/v_prev_mkt)*100,1);
    IF abs(v_delta) >= 15 THEN
      v_insights := v_insights || jsonb_build_object(
        'type', CASE WHEN v_delta>=0 THEN 'warning' ELSE 'positive' END,
        'message', 'Investimento em marketing ' || CASE WHEN v_delta>=0 THEN 'aumentou ' ELSE 'reduziu ' END
                   || abs(v_delta) || '% no período'
      );
    END IF;
  END IF;

  -- EBITDA aproximado = receita - deduções - custos diretos - despesas operacionais
  WITH s AS (SELECT key, value::numeric AS v FROM jsonb_each_text(v_cmp->'current'->'sections'))
  SELECT
    coalesce(SUM(v) FILTER (WHERE key LIKE 'receita_%'),0)
    - coalesce(SUM(v) FILTER (WHERE key LIKE 'deducao_%'),0)
    - coalesce(SUM(v) FILTER (WHERE key LIKE 'custo_%'),0)
    - coalesce(SUM(v) FILTER (WHERE key LIKE 'despesa_%'),0)
  INTO v_curr_ebitda FROM s;

  WITH s AS (SELECT key, value::numeric AS v FROM jsonb_each_text(v_cmp->'previous'->'sections'))
  SELECT
    coalesce(SUM(v) FILTER (WHERE key LIKE 'receita_%'),0)
    - coalesce(SUM(v) FILTER (WHERE key LIKE 'deducao_%'),0)
    - coalesce(SUM(v) FILTER (WHERE key LIKE 'custo_%'),0)
    - coalesce(SUM(v) FILTER (WHERE key LIKE 'despesa_%'),0)
  INTO v_prev_ebitda FROM s;

  IF v_curr_rec > 0 THEN
    v_insights := v_insights || jsonb_build_object(
      'type','info',
      'message','Margem EBITDA atual: ' || round((v_curr_ebitda/v_curr_rec)*100,1) || '%'
    );
  END IF;

  IF v_prev_ebitda <> 0 THEN
    v_delta := round(((v_curr_ebitda - v_prev_ebitda)/abs(v_prev_ebitda))*100,1);
    IF abs(v_delta) >= 10 THEN
      v_insights := v_insights || jsonb_build_object(
        'type', CASE WHEN v_delta>=0 THEN 'positive' ELSE 'negative' END,
        'message','EBITDA ' || CASE WHEN v_delta>=0 THEN 'melhorou ' ELSE 'caiu ' END
                  || abs(v_delta) || '% vs período anterior'
      );
    END IF;
  END IF;

  RETURN v_insights;
END $$;