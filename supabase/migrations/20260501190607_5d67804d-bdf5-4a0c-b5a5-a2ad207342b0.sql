-- 1) Tabela de limites por empresa (1 linha por company)
CREATE TABLE IF NOT EXISTS public.ai_agent_limits (
  company_id UUID PRIMARY KEY,
  daily_message_cap INT NOT NULL DEFAULT 0,
  monthly_message_cap INT NOT NULL DEFAULT 0,
  monthly_token_cap BIGINT NOT NULL DEFAULT 0,
  monthly_cost_cap_brl NUMERIC(12,2) NOT NULL DEFAULT 0,
  block_when_exceeded BOOLEAN NOT NULL DEFAULT true,
  send_block_message BOOLEAN NOT NULL DEFAULT true,
  block_message_to_client TEXT NOT NULL DEFAULT 'No momento estou indisponível. Em breve um atendente humano falará com você.',
  notify_admins_on_block BOOLEAN NOT NULL DEFAULT true,
  currently_blocked BOOLEAN NOT NULL DEFAULT false,
  blocked_reason TEXT,
  blocked_at TIMESTAMPTZ,
  blocked_until TIMESTAMPTZ,
  last_block_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_agent_limits_caps_nonneg CHECK (
    daily_message_cap >= 0 AND monthly_message_cap >= 0
    AND monthly_token_cap >= 0 AND monthly_cost_cap_brl >= 0
  )
);

ALTER TABLE public.ai_agent_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage ai_agent_limits"
  ON public.ai_agent_limits FOR ALL
  TO authenticated
  USING (is_master(auth.uid()))
  WITH CHECK (is_master(auth.uid()));

CREATE POLICY "Company admins view own limits"
  ON public.ai_agent_limits FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid()));

CREATE POLICY "Company admins insert own limits"
  ON public.ai_agent_limits FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_admin(auth.uid())
    AND is_company_active(company_id)
  );

CREATE POLICY "Company admins update own limits"
  ON public.ai_agent_limits FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_admin(auth.uid())
    AND is_company_active(company_id)
  )
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_admin(auth.uid())
    AND is_company_active(company_id)
  );

-- updated_at trigger
CREATE TRIGGER trg_ai_agent_limits_updated_at
  BEFORE UPDATE ON public.ai_agent_limits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) RPC: avalia limites considerando o timezone da empresa
CREATE OR REPLACE FUNCTION public.check_ai_agent_limits(_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lim public.ai_agent_limits%ROWTYPE;
  _tz TEXT;
  _now TIMESTAMPTZ := now();
  _local_now TIMESTAMP;
  _day_start TIMESTAMPTZ;
  _day_end TIMESTAMPTZ;
  _month_start TIMESTAMPTZ;
  _month_end TIMESTAMPTZ;
  _today_msgs INT := 0;
  _month_msgs INT := 0;
  _month_tokens BIGINT := 0;
  _month_cost NUMERIC := 0;
  _reason TEXT := NULL;
  _allowed BOOLEAN := true;
BEGIN
  -- Empresa
  SELECT COALESCE(timezone, 'America/Sao_Paulo') INTO _tz
    FROM public.companies WHERE id = _company_id;
  IF _tz IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', NULL);
  END IF;

  -- Limites (default tudo zero quando inexistente)
  SELECT * INTO _lim FROM public.ai_agent_limits WHERE company_id = _company_id;

  -- Janelas no fuso da empresa
  _local_now := _now AT TIME ZONE _tz;
  _day_start := (date_trunc('day', _local_now)) AT TIME ZONE _tz;
  _day_end   := _day_start + INTERVAL '1 day';
  _month_start := (date_trunc('month', _local_now)) AT TIME ZONE _tz;
  _month_end   := _month_start + INTERVAL '1 month';

  -- Uso do dia
  SELECT COALESCE(SUM(messages_consumed), 0)::INT
    INTO _today_msgs
    FROM public.ai_agent_runs
    WHERE company_id = _company_id
      AND created_at >= _day_start AND created_at < _day_end;

  -- Uso do mês
  SELECT
    COALESCE(SUM(messages_consumed), 0)::INT,
    COALESCE(SUM(COALESCE(tokens_in,0) + COALESCE(tokens_out,0)), 0)::BIGINT,
    COALESCE(SUM(cost_brl), 0)::NUMERIC
  INTO _month_msgs, _month_tokens, _month_cost
  FROM public.ai_agent_runs
  WHERE company_id = _company_id
    AND created_at >= _month_start AND created_at < _month_end;

  -- Bloqueio manual ainda dentro da janela
  IF _lim.currently_blocked AND _lim.blocked_until IS NOT NULL AND _lim.blocked_until > _now THEN
    _allowed := false;
    _reason := COALESCE(_lim.blocked_reason, 'manual_block');
  ELSE
    -- Avalia caps (0 = sem limite)
    IF _allowed AND _lim.daily_message_cap > 0 AND _today_msgs >= _lim.daily_message_cap THEN
      _allowed := false; _reason := 'daily_cap';
    END IF;
    IF _allowed AND _lim.monthly_message_cap > 0 AND _month_msgs >= _lim.monthly_message_cap THEN
      _allowed := false; _reason := 'monthly_cap';
    END IF;
    IF _allowed AND _lim.monthly_token_cap > 0 AND _month_tokens >= _lim.monthly_token_cap THEN
      _allowed := false; _reason := 'token_cap';
    END IF;
    IF _allowed AND _lim.monthly_cost_cap_brl > 0 AND _month_cost >= _lim.monthly_cost_cap_brl THEN
      _allowed := false; _reason := 'cost_cap';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'allowed', _allowed,
    'reason', _reason,
    'block_when_exceeded', COALESCE(_lim.block_when_exceeded, true),
    'send_block_message', COALESCE(_lim.send_block_message, true),
    'block_message_to_client', _lim.block_message_to_client,
    'notify_admins_on_block', COALESCE(_lim.notify_admins_on_block, true),
    'currently_blocked', COALESCE(_lim.currently_blocked, false),
    'blocked_until', _lim.blocked_until,
    'window_day_end', _day_end,
    'window_month_end', _month_end,
    'usage', jsonb_build_object(
      'today_msgs', _today_msgs,
      'month_msgs', _month_msgs,
      'month_tokens', _month_tokens,
      'month_cost_brl', ROUND(_month_cost, 2)
    ),
    'limits', jsonb_build_object(
      'daily_message_cap', COALESCE(_lim.daily_message_cap, 0),
      'monthly_message_cap', COALESCE(_lim.monthly_message_cap, 0),
      'monthly_token_cap', COALESCE(_lim.monthly_token_cap, 0),
      'monthly_cost_cap_brl', COALESCE(_lim.monthly_cost_cap_brl, 0)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_agent_limits(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_ai_agent_limits(UUID) TO authenticated, service_role;