
CREATE TABLE IF NOT EXISTS public.webhook_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('persist_message','status_update')),
  payload jsonb NOT NULL,
  message_id text,
  provider text,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 8,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  picked_at timestamptz,
  last_error text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','dead','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wrq_pending_due
  ON public.webhook_retry_queue (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_wrq_company_msg
  ON public.webhook_retry_queue (company_id, message_id);

CREATE INDEX IF NOT EXISTS idx_wrq_dead
  ON public.webhook_retry_queue (created_at DESC)
  WHERE status = 'dead';

CREATE UNIQUE INDEX IF NOT EXISTS uq_wrq_pending
  ON public.webhook_retry_queue (company_id, kind, message_id)
  WHERE status = 'pending' AND message_id IS NOT NULL;

ALTER TABLE public.webhook_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master can view all retries"
  ON public.webhook_retry_queue FOR SELECT
  USING (public.is_master(auth.uid()));

CREATE POLICY "Company admin sees own retries"
  ON public.webhook_retry_queue FOR SELECT
  USING (
    public.is_company_admin(auth.uid())
    AND public.get_user_company_id(auth.uid()) = company_id
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public._wrq_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wrq_updated_at ON public.webhook_retry_queue;
CREATE TRIGGER trg_wrq_updated_at
  BEFORE UPDATE ON public.webhook_retry_queue
  FOR EACH ROW
  EXECUTE FUNCTION public._wrq_set_updated_at();

-- Enqueue (idempotent)
CREATE OR REPLACE FUNCTION public.enqueue_webhook_retry(
  _company_id uuid,
  _kind text,
  _message_id text,
  _provider text,
  _payload jsonb,
  _initial_error text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _message_id IS NOT NULL THEN
    SELECT id INTO _id
    FROM public.webhook_retry_queue
    WHERE company_id = _company_id
      AND kind = _kind
      AND message_id = _message_id
      AND status = 'pending'
    LIMIT 1;

    IF _id IS NOT NULL THEN
      UPDATE public.webhook_retry_queue
      SET payload = _payload,
          last_error = COALESCE(_initial_error, last_error)
      WHERE id = _id;
      RETURN _id;
    END IF;
  END IF;

  INSERT INTO public.webhook_retry_queue (
    company_id, kind, message_id, provider, payload, last_error,
    next_attempt_at
  ) VALUES (
    _company_id, _kind, _message_id, _provider, _payload, _initial_error,
    now() + interval '15 seconds'
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

-- Claim a batch with row-level lock
CREATE OR REPLACE FUNCTION public.claim_webhook_retries(_limit int DEFAULT 50)
RETURNS SETOF public.webhook_retry_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM public.webhook_retry_queue
    WHERE status = 'pending'
      AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(_limit, 200))
  )
  UPDATE public.webhook_retry_queue q
  SET picked_at = now()
  FROM cte
  WHERE q.id = cte.id
  RETURNING q.*;
END;
$$;

-- Mark done
CREATE OR REPLACE FUNCTION public.mark_webhook_retry_done(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.webhook_retry_queue
  SET status = 'done', last_error = NULL, picked_at = NULL
  WHERE id = _id;
$$;

-- Mark failed (with exponential backoff + jitter)
CREATE OR REPLACE FUNCTION public.mark_webhook_retry_failed(_id uuid, _error text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q public.webhook_retry_queue%ROWTYPE;
  next_attempts int;
  delay_seconds numeric;
  jitter numeric;
  new_status text;
BEGIN
  SELECT * INTO q FROM public.webhook_retry_queue WHERE id = _id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  next_attempts := q.attempts + 1;

  IF next_attempts >= q.max_attempts THEN
    new_status := 'dead';
    UPDATE public.webhook_retry_queue
    SET attempts = next_attempts,
        last_error = _error,
        status = 'dead',
        picked_at = NULL
    WHERE id = _id;
    RETURN 'dead';
  END IF;

  -- Backoff: 30s, 60s, 120s, 300s, 900s, 1800s, 3600s
  delay_seconds := CASE next_attempts
    WHEN 1 THEN 30
    WHEN 2 THEN 60
    WHEN 3 THEN 120
    WHEN 4 THEN 300
    WHEN 5 THEN 900
    WHEN 6 THEN 1800
    ELSE 3600
  END;
  jitter := (random() * 0.4 - 0.2);  -- ±20%
  delay_seconds := delay_seconds * (1 + jitter);

  UPDATE public.webhook_retry_queue
  SET attempts = next_attempts,
      last_error = _error,
      next_attempt_at = now() + (delay_seconds || ' seconds')::interval,
      picked_at = NULL,
      status = 'pending'
  WHERE id = _id;
  RETURN 'pending';
END;
$$;

-- Force retry now (admin action)
CREATE OR REPLACE FUNCTION public.retry_webhook_now(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
BEGIN
  SELECT company_id INTO cid FROM public.webhook_retry_queue WHERE id = _id;
  IF cid IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.is_master(auth.uid()) OR (public.is_company_admin(auth.uid()) AND public.get_user_company_id(auth.uid()) = cid)) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.webhook_retry_queue
  SET status = 'pending', next_attempt_at = now(), picked_at = NULL
  WHERE id = _id;
END;
$$;

-- Cancel (admin)
CREATE OR REPLACE FUNCTION public.cancel_webhook_retry(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid;
BEGIN
  SELECT company_id INTO cid FROM public.webhook_retry_queue WHERE id = _id;
  IF cid IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT (public.is_master(auth.uid()) OR (public.is_company_admin(auth.uid()) AND public.get_user_company_id(auth.uid()) = cid)) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.webhook_retry_queue
  SET status = 'cancelled', picked_at = NULL
  WHERE id = _id;
END;
$$;

-- Stats
CREATE OR REPLACE FUNCTION public.get_webhook_retry_stats(_company_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF _company_id IS NOT NULL THEN
    IF NOT (public.is_master(auth.uid()) OR (public.is_company_admin(auth.uid()) AND public.get_user_company_id(auth.uid()) = _company_id)) THEN
      RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.is_master(auth.uid()) THEN
      RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE status='pending'),
    'dead', count(*) FILTER (WHERE status='dead'),
    'done_24h', count(*) FILTER (WHERE status='done' AND updated_at > now() - interval '24 hours'),
    'oldest_pending', min(created_at) FILTER (WHERE status='pending')
  )
  INTO result
  FROM public.webhook_retry_queue
  WHERE _company_id IS NULL OR company_id = _company_id;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.retry_webhook_now(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_webhook_retry(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_webhook_retry_stats(uuid) TO authenticated;
