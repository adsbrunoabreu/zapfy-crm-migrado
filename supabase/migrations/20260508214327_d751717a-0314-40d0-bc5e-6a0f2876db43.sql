
-- ============================================================
-- chat_messages.client_id
-- ============================================================
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS client_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_company_client
  ON public.chat_messages (company_id, client_id)
  WHERE client_id IS NOT NULL;

-- ============================================================
-- outbound_message_queue
-- ============================================================
CREATE TABLE IF NOT EXISTS public.outbound_message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  company_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  user_id uuid,
  provider text NOT NULL CHECK (provider IN ('evolution','cloud_api')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','failed','dead','cancelled')),
  retry_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  picked_at timestamptz,
  processed_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_outbound_queue_pending
  ON public.outbound_message_queue (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbound_queue_company
  ON public.outbound_message_queue (company_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbound_queue_conversation
  ON public.outbound_message_queue (conversation_id, created_at DESC);

ALTER TABLE public.outbound_message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_select_outbound_queue" ON public.outbound_message_queue
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

CREATE POLICY "company_user_select_outbound_queue" ON public.outbound_message_queue
  FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id(auth.uid()));

DROP TRIGGER IF EXISTS trg_outbound_queue_updated ON public.outbound_message_queue;
CREATE TRIGGER trg_outbound_queue_updated
BEFORE UPDATE ON public.outbound_message_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RPC: enqueue_outbound_message (chamada pelo edge function com user JWT)
-- Idempotente: se o client_id já existir, retorna o mesmo registro.
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_outbound_message(
  _client_id uuid,
  _conversation_id uuid,
  _provider text,
  _payload jsonb
) RETURNS public.outbound_message_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_user uuid := auth.uid();
  v_conv_company uuid;
  v_existing public.outbound_message_queue;
  v_new public.outbound_message_queue;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  v_company := public.get_user_company_id(v_user);
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'no_company';
  END IF;

  SELECT company_id INTO v_conv_company FROM public.conversations WHERE id = _conversation_id;
  IF v_conv_company IS NULL OR v_conv_company <> v_company THEN
    RAISE EXCEPTION 'conversation_not_in_company';
  END IF;

  IF NOT public.is_company_active(v_company) THEN
    RAISE EXCEPTION 'company_inactive';
  END IF;

  -- Idempotência por client_id
  SELECT * INTO v_existing FROM public.outbound_message_queue
   WHERE company_id = v_company AND client_id = _client_id
   LIMIT 1;
  IF FOUND THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.outbound_message_queue (
    client_id, company_id, conversation_id, user_id, provider, payload
  ) VALUES (
    _client_id, v_company, _conversation_id, v_user, _provider, _payload
  )
  RETURNING * INTO v_new;

  RETURN v_new;
END $$;

-- ============================================================
-- RPC: claim_outbound_messages (worker)
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_outbound_messages(_limit int DEFAULT 20)
RETURNS SETOF public.outbound_message_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.outbound_message_queue
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.outbound_message_queue q
     SET status = 'processing',
         picked_at = now(),
         retry_count = retry_count + 1,
         updated_at = now()
    FROM picked
   WHERE q.id = picked.id
   RETURNING q.*;
END $$;

CREATE OR REPLACE FUNCTION public.mark_outbound_sent(_id uuid, _provider_message_id text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.outbound_message_queue
     SET status = 'sent',
         processed_at = now(),
         provider_message_id = _provider_message_id,
         error = NULL,
         updated_at = now()
   WHERE id = _id;
$$;

CREATE OR REPLACE FUNCTION public.mark_outbound_failed(_id uuid, _error text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int;
  v_max int;
  v_delay int;
BEGIN
  SELECT retry_count, max_attempts INTO v_attempts, v_max
    FROM public.outbound_message_queue WHERE id = _id;

  IF v_attempts >= v_max THEN
    UPDATE public.outbound_message_queue
       SET status = 'dead', error = _error, updated_at = now()
     WHERE id = _id;
    RETURN 'dead';
  END IF;

  v_delay := LEAST(POWER(2, v_attempts)::int * 5, 600);
  UPDATE public.outbound_message_queue
     SET status = 'pending',
         error = _error,
         next_attempt_at = now() + make_interval(secs => v_delay),
         updated_at = now()
   WHERE id = _id;
  RETURN 'pending';
END $$;
