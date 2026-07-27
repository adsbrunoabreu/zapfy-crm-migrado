
-- Configuração por provedor
CREATE TABLE public.provider_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL UNIQUE,
  tokens_per_sec NUMERIC NOT NULL DEFAULT 1.0,
  bucket_capacity INTEGER NOT NULL DEFAULT 10,
  failure_threshold INTEGER NOT NULL DEFAULT 5,
  open_seconds INTEGER NOT NULL DEFAULT 60,
  half_open_max_calls INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prl_master_all" ON public.provider_rate_limits
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'master')) WITH CHECK (public.has_role(auth.uid(),'master'));
CREATE POLICY "prl_authenticated_read" ON public.provider_rate_limits
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_prl_updated_at BEFORE UPDATE ON public.provider_rate_limits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Estado por (empresa, provedor)
CREATE TABLE public.provider_circuit_state (
  company_id UUID NOT NULL,
  provider TEXT NOT NULL,
  tokens NUMERIC NOT NULL DEFAULT 0,
  last_refill_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'closed' CHECK (status IN ('closed','open','half_open')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  consecutive_successes INTEGER NOT NULL DEFAULT 0,
  opened_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  half_open_in_flight INTEGER NOT NULL DEFAULT 0,
  total_allowed BIGINT NOT NULL DEFAULT 0,
  total_throttled BIGINT NOT NULL DEFAULT 0,
  total_short_circuited BIGINT NOT NULL DEFAULT 0,
  total_failures BIGINT NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, provider)
);

ALTER TABLE public.provider_circuit_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pcs_read_own_or_master" ON public.provider_circuit_state
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'master') OR company_id = public.get_user_company_id(auth.uid()));

-- Defaults seguros
INSERT INTO public.provider_rate_limits (provider, tokens_per_sec, bucket_capacity, failure_threshold, open_seconds) VALUES
  ('whatsapp', 1.2, 10, 5, 60),
  ('shopify',  2.0, 20, 5, 60)
ON CONFLICT (provider) DO NOTHING;

-- Tenta consumir 1 token. Retorna { allowed, reason, retry_after_sec, status }
CREATE OR REPLACE FUNCTION public.try_consume_provider_token(
  p_company_id UUID,
  p_provider TEXT,
  p_cost NUMERIC DEFAULT 1
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.provider_rate_limits%ROWTYPE;
  st  public.provider_circuit_state%ROWTYPE;
  now_ts TIMESTAMPTZ := clock_timestamp();
  refill NUMERIC;
  retry_sec NUMERIC;
BEGIN
  SELECT * INTO cfg FROM public.provider_rate_limits WHERE provider = p_provider;
  IF NOT FOUND OR NOT cfg.enabled THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_limit');
  END IF;

  -- Lock + upsert estado
  INSERT INTO public.provider_circuit_state (company_id, provider, tokens, last_refill_at)
    VALUES (p_company_id, p_provider, cfg.bucket_capacity, now_ts)
  ON CONFLICT (company_id, provider) DO NOTHING;

  SELECT * INTO st FROM public.provider_circuit_state
   WHERE company_id = p_company_id AND provider = p_provider FOR UPDATE;

  -- Circuit breaker: open / half_open
  IF st.status = 'open' THEN
    IF st.next_attempt_at IS NULL OR now_ts < st.next_attempt_at THEN
      retry_sec := GREATEST(1, EXTRACT(EPOCH FROM (st.next_attempt_at - now_ts)));
      UPDATE public.provider_circuit_state
         SET total_short_circuited = total_short_circuited + 1, updated_at = now_ts
       WHERE company_id = p_company_id AND provider = p_provider;
      RETURN jsonb_build_object('allowed', false, 'reason', 'circuit_open', 'retry_after_sec', retry_sec, 'status', 'open');
    ELSE
      -- transição para half_open
      st.status := 'half_open';
      st.half_open_in_flight := 0;
    END IF;
  END IF;

  IF st.status = 'half_open' AND st.half_open_in_flight >= cfg.half_open_max_calls THEN
    UPDATE public.provider_circuit_state
       SET total_short_circuited = total_short_circuited + 1, updated_at = now_ts
     WHERE company_id = p_company_id AND provider = p_provider;
    RETURN jsonb_build_object('allowed', false, 'reason', 'half_open_busy', 'retry_after_sec', 1, 'status', 'half_open');
  END IF;

  -- Refill do balde
  refill := EXTRACT(EPOCH FROM (now_ts - st.last_refill_at)) * cfg.tokens_per_sec;
  st.tokens := LEAST(cfg.bucket_capacity::numeric, st.tokens + refill);
  st.last_refill_at := now_ts;

  IF st.tokens < p_cost THEN
    retry_sec := CEIL((p_cost - st.tokens) / NULLIF(cfg.tokens_per_sec,0));
    UPDATE public.provider_circuit_state
       SET tokens = st.tokens, last_refill_at = st.last_refill_at,
           status = st.status, half_open_in_flight = st.half_open_in_flight,
           total_throttled = total_throttled + 1, updated_at = now_ts
     WHERE company_id = p_company_id AND provider = p_provider;
    RETURN jsonb_build_object('allowed', false, 'reason', 'rate_limited', 'retry_after_sec', retry_sec, 'status', st.status);
  END IF;

  -- Consome
  st.tokens := st.tokens - p_cost;
  IF st.status = 'half_open' THEN
    st.half_open_in_flight := st.half_open_in_flight + 1;
  END IF;

  UPDATE public.provider_circuit_state
     SET tokens = st.tokens, last_refill_at = st.last_refill_at,
         status = st.status, half_open_in_flight = st.half_open_in_flight,
         total_allowed = total_allowed + 1, updated_at = now_ts
   WHERE company_id = p_company_id AND provider = p_provider;

  RETURN jsonb_build_object('allowed', true, 'status', st.status, 'tokens_left', st.tokens);
END;
$$;

-- Registra resultado da chamada e atualiza breaker
CREATE OR REPLACE FUNCTION public.record_provider_outcome(
  p_company_id UUID,
  p_provider TEXT,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg public.provider_rate_limits%ROWTYPE;
  st  public.provider_circuit_state%ROWTYPE;
  now_ts TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT * INTO cfg FROM public.provider_rate_limits WHERE provider = p_provider;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO st FROM public.provider_circuit_state
   WHERE company_id = p_company_id AND provider = p_provider FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF p_success THEN
    IF st.status = 'half_open' THEN
      -- fecha o circuito após sucesso em half-open
      UPDATE public.provider_circuit_state
         SET status = 'closed', consecutive_failures = 0,
             consecutive_successes = st.consecutive_successes + 1,
             half_open_in_flight = GREATEST(0, st.half_open_in_flight - 1),
             opened_at = NULL, next_attempt_at = NULL,
             last_error = NULL, updated_at = now_ts
       WHERE company_id = p_company_id AND provider = p_provider;
    ELSE
      UPDATE public.provider_circuit_state
         SET consecutive_failures = 0,
             consecutive_successes = st.consecutive_successes + 1,
             updated_at = now_ts
       WHERE company_id = p_company_id AND provider = p_provider;
    END IF;
  ELSE
    -- falha
    IF st.consecutive_failures + 1 >= cfg.failure_threshold OR st.status = 'half_open' THEN
      UPDATE public.provider_circuit_state
         SET status = 'open',
             consecutive_failures = st.consecutive_failures + 1,
             consecutive_successes = 0,
             half_open_in_flight = 0,
             opened_at = now_ts,
             next_attempt_at = now_ts + (cfg.open_seconds || ' seconds')::interval,
             total_failures = st.total_failures + 1,
             last_error = COALESCE(LEFT(p_error, 500), st.last_error),
             updated_at = now_ts
       WHERE company_id = p_company_id AND provider = p_provider;
    ELSE
      UPDATE public.provider_circuit_state
         SET consecutive_failures = st.consecutive_failures + 1,
             total_failures = st.total_failures + 1,
             last_error = COALESCE(LEFT(p_error, 500), st.last_error),
             updated_at = now_ts
       WHERE company_id = p_company_id AND provider = p_provider;
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.try_consume_provider_token(UUID,TEXT,NUMERIC) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_provider_outcome(UUID,TEXT,BOOLEAN,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.try_consume_provider_token(UUID,TEXT,NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_provider_outcome(UUID,TEXT,BOOLEAN,TEXT) TO authenticated;
