
CREATE OR REPLACE FUNCTION public.get_master_ai_overview(
  _from timestamptz,
  _to timestamptz,
  _prev_from timestamptz,
  _prev_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _kpis jsonb;
  _series jsonb;
  _top jsonb;
  _blocked jsonb;
  _models jsonb;
  _kb jsonb;
  _opportunities jsonb;
  _addons_active int;
  _addons_active_prev int;
  _mrr_addon numeric;
  _msgs int; _msgs_prev int;
  _cost numeric; _cost_prev numeric;
  _runs int; _runs_prev int;
  _qualified int; _transferred int; _audios int; _errors int;
  _avg_latency numeric;
BEGIN
  IF NOT is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  -- Add-ons ativos
  SELECT COUNT(*), COALESCE(SUM(monthly_price), 0)
    INTO _addons_active, _mrr_addon
  FROM company_addons
  WHERE addon_slug = 'ai_agent' AND is_active = true;

  -- Add-ons ativos no fim do período anterior (heurística por activated_at/deactivated_at)
  SELECT COUNT(*) INTO _addons_active_prev
  FROM company_addons
  WHERE addon_slug = 'ai_agent'
    AND activated_at <= _prev_to
    AND (deactivated_at IS NULL OR deactivated_at > _prev_to);

  -- Agregados de runs no período
  SELECT
    COALESCE(SUM(messages_consumed), 0),
    COALESCE(SUM(cost_brl), 0),
    COUNT(*),
    COUNT(*) FILTER (WHERE tools_called::text ILIKE '%qualify_lead%'),
    COUNT(*) FILTER (WHERE tools_called::text ILIKE '%transfer_to_human%'),
    COUNT(*) FILTER (WHERE had_audio = true),
    COUNT(*) FILTER (WHERE status = 'error'),
    COALESCE(AVG(latency_ms), 0)
  INTO _msgs, _cost, _runs, _qualified, _transferred, _audios, _errors, _avg_latency
  FROM ai_agent_runs
  WHERE created_at >= _from AND created_at <= _to;

  -- Período anterior (apenas o necessário para deltas)
  SELECT
    COALESCE(SUM(messages_consumed), 0),
    COALESCE(SUM(cost_brl), 0),
    COUNT(*)
  INTO _msgs_prev, _cost_prev, _runs_prev
  FROM ai_agent_runs
  WHERE created_at >= _prev_from AND created_at <= _prev_to;

  _kpis := jsonb_build_object(
    'addonsActive', _addons_active,
    'addonsActivePrev', _addons_active_prev,
    'mrrAddon', _mrr_addon,
    'messages', _msgs,
    'messagesPrev', _msgs_prev,
    'cost', ROUND(_cost, 4),
    'costPrev', ROUND(_cost_prev, 4),
    'runs', _runs,
    'runsPrev', _runs_prev,
    'qualified', _qualified,
    'transferred', _transferred,
    'audios', _audios,
    'errors', _errors,
    'avgLatencyMs', ROUND(_avg_latency, 0),
    'qualificationRate', CASE WHEN _runs > 0 THEN ROUND((_qualified::numeric / _runs) * 100, 1) ELSE 0 END,
    'handoffRate', CASE WHEN _runs > 0 THEN ROUND((_transferred::numeric / _runs) * 100, 1) ELSE 0 END,
    'errorRate', CASE WHEN _runs > 0 THEN ROUND((_errors::numeric / _runs) * 100, 1) ELSE 0 END
  );

  -- Série diária (uso ao longo do período)
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.day), '[]'::jsonb) INTO _series
  FROM (
    SELECT
      date_trunc('day', created_at) AS day,
      COUNT(*) AS runs,
      COALESCE(SUM(messages_consumed), 0) AS messages,
      ROUND(COALESCE(SUM(cost_brl), 0), 4) AS cost,
      COUNT(*) FILTER (WHERE status = 'error') AS errors
    FROM ai_agent_runs
    WHERE created_at >= _from AND created_at <= _to
    GROUP BY 1
    ORDER BY 1
  ) t;

  -- Top empresas
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _top
  FROM (
    SELECT
      c.id, c.name, c.logo_url, c.plan_status,
      COALESCE(r.runs, 0) AS runs,
      COALESCE(r.messages, 0) AS messages,
      COALESCE(r.cost, 0) AS cost,
      COALESCE(r.qualified, 0) AS qualified,
      COALESCE(r.transferred, 0) AS transferred,
      COALESCE(r.avg_latency, 0) AS avg_latency_ms,
      COALESCE(a.is_active, false) AS addon_active,
      COALESCE(a.included_messages, 0) AS included,
      COALESCE(a.overage_price_per_message, 0) AS overage_price,
      COALESCE(a.monthly_price, 0) AS monthly_price,
      COALESCE(l.currently_blocked, false) AS blocked,
      l.blocked_reason,
      GREATEST(0, COALESCE(r.messages, 0) - COALESCE(a.included_messages, 0)) AS overage,
      ROUND(
        COALESCE(a.monthly_price, 0)
        + GREATEST(0, COALESCE(r.messages, 0) - COALESCE(a.included_messages, 0))
          * COALESCE(a.overage_price_per_message, 0)
      , 2) AS projected_invoice
    FROM companies c
    LEFT JOIN (
      SELECT company_id,
             COUNT(*) AS runs,
             SUM(messages_consumed) AS messages,
             ROUND(SUM(cost_brl), 4) AS cost,
             COUNT(*) FILTER (WHERE tools_called::text ILIKE '%qualify_lead%') AS qualified,
             COUNT(*) FILTER (WHERE tools_called::text ILIKE '%transfer_to_human%') AS transferred,
             ROUND(AVG(latency_ms), 0) AS avg_latency
      FROM ai_agent_runs
      WHERE created_at >= _from AND created_at <= _to
      GROUP BY company_id
    ) r ON r.company_id = c.id
    LEFT JOIN company_addons a
      ON a.company_id = c.id AND a.addon_slug = 'ai_agent' AND a.is_active = true
    LEFT JOIN ai_agent_limits l ON l.company_id = c.id
    WHERE COALESCE(r.runs, 0) > 0 OR a.is_active = true
    ORDER BY COALESCE(r.messages, 0) DESC, COALESCE(a.is_active, false) DESC
    LIMIT 10
  ) t;

  -- Bloqueadas
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _blocked
  FROM (
    SELECT c.id, c.name, l.blocked_reason, l.blocked_at, l.blocked_until
    FROM ai_agent_limits l
    JOIN companies c ON c.id = l.company_id
    WHERE l.currently_blocked = true
    ORDER BY l.blocked_at DESC NULLS LAST
    LIMIT 20
  ) t;

  -- Distribuição por modelo
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.runs DESC), '[]'::jsonb) INTO _models
  FROM (
    SELECT COALESCE(model, 'unknown') AS model, COUNT(*) AS runs
    FROM ai_agent_runs
    WHERE created_at >= _from AND created_at <= _to
    GROUP BY 1
  ) t;

  -- Base de conhecimento (estado atual)
  SELECT jsonb_build_object(
    'total', COUNT(*),
    'ready', COUNT(*) FILTER (WHERE status = 'ready'),
    'processing', COUNT(*) FILTER (WHERE status IN ('processing', 'pending')),
    'errors', COUNT(*) FILTER (WHERE status = 'error'),
    'sizeMb', ROUND(COALESCE(SUM(size_bytes), 0) / 1048576.0, 2),
    'companiesWithKb', COUNT(DISTINCT company_id)
  ) INTO _kb
  FROM ai_knowledge_documents;

  -- Oportunidades: empresas SEM addon ativo mas com volume alto de mensagens humanas no período
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO _opportunities
  FROM (
    SELECT c.id, c.name, c.plan_status,
           m.msg_count AS human_messages
    FROM companies c
    LEFT JOIN company_addons a
      ON a.company_id = c.id AND a.addon_slug = 'ai_agent' AND a.is_active = true
    JOIN (
      SELECT company_id, COUNT(*) AS msg_count
      FROM chat_messages
      WHERE created_at >= _from AND created_at <= _to
      GROUP BY company_id
      HAVING COUNT(*) >= 100
    ) m ON m.company_id = c.id
    WHERE a.id IS NULL
      AND c.plan_status IN ('active','trial')
    ORDER BY m.msg_count DESC
    LIMIT 10
  ) t;

  _result := jsonb_build_object(
    'kpis', _kpis,
    'series', _series,
    'topCompanies', _top,
    'blocked', _blocked,
    'models', _models,
    'kb', _kb,
    'opportunities', _opportunities,
    'period', jsonb_build_object('from', _from, 'to', _to)
  );

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_master_ai_overview(timestamptz, timestamptz, timestamptz, timestamptz) TO authenticated;
