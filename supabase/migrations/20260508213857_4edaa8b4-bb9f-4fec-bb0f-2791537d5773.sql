
-- ============================================================
-- webhook_inbox
-- ============================================================
CREATE TABLE IF NOT EXISTS public.webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('evolution','cloud_api','unknown')),
  payload jsonb NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','dead')),
  error text,
  retry_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  signature_verified boolean NOT NULL DEFAULT false,
  picked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_inbox_pending
  ON public.webhook_inbox (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_status
  ON public.webhook_inbox (status, received_at DESC);

ALTER TABLE public.webhook_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_select_webhook_inbox" ON public.webhook_inbox
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

-- ============================================================
-- media_fetch_jobs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.media_fetch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  instance_id uuid NOT NULL,
  message_id text NOT NULL,
  media_id text NOT NULL,
  media_type text NOT NULL,
  media_mimetype text,
  provider text NOT NULL DEFAULT 'cloud_api',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','dead')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  picked_at timestamptz,
  last_error text,
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, message_id, media_id)
);

CREATE INDEX IF NOT EXISTS idx_media_fetch_jobs_pending
  ON public.media_fetch_jobs (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_media_fetch_jobs_company
  ON public.media_fetch_jobs (company_id, status, updated_at DESC);

ALTER TABLE public.media_fetch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "master_select_media_fetch_jobs" ON public.media_fetch_jobs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));

CREATE POLICY "company_admin_select_media_fetch_jobs" ON public.media_fetch_jobs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'company_admin')
    AND company_id = public.get_user_company_id(auth.uid())
  );

-- updated_at trigger reuse
DROP TRIGGER IF EXISTS trg_webhook_inbox_updated ON public.webhook_inbox;
CREATE TRIGGER trg_webhook_inbox_updated
BEFORE UPDATE ON public.webhook_inbox
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_media_fetch_jobs_updated ON public.media_fetch_jobs;
CREATE TRIGGER trg_media_fetch_jobs_updated
BEFORE UPDATE ON public.media_fetch_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RPCs: webhook_inbox
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_webhook_inbox(_limit int DEFAULT 25)
RETURNS SETOF public.webhook_inbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.webhook_inbox
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.webhook_inbox w
     SET status = 'processing', picked_at = now(), updated_at = now()
    FROM picked
   WHERE w.id = picked.id
   RETURNING w.*;
END $$;

CREATE OR REPLACE FUNCTION public.mark_webhook_inbox_done(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.webhook_inbox
     SET status = 'done', processed_at = now(), error = NULL, updated_at = now()
   WHERE id = _id;
$$;

CREATE OR REPLACE FUNCTION public.mark_webhook_inbox_failed(_id uuid, _error text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempts int;
  v_max int;
  v_status text;
  v_delay int;
BEGIN
  UPDATE public.webhook_inbox
     SET retry_count = retry_count + 1,
         error = _error,
         updated_at = now()
   WHERE id = _id
   RETURNING retry_count, max_attempts INTO v_attempts, v_max;

  IF v_attempts >= v_max THEN
    UPDATE public.webhook_inbox
       SET status = 'dead', updated_at = now()
     WHERE id = _id;
    RETURN 'dead';
  END IF;

  -- Backoff exponencial: 2^n segundos, máx 1h
  v_delay := LEAST(POWER(2, v_attempts)::int, 3600);
  UPDATE public.webhook_inbox
     SET status = 'pending',
         next_attempt_at = now() + make_interval(secs => v_delay)
   WHERE id = _id;
  RETURN 'pending';
END $$;

-- ============================================================
-- RPCs: media_fetch_jobs
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_media_fetch_job(
  _company_id uuid,
  _instance_id uuid,
  _message_id text,
  _media_id text,
  _media_type text,
  _media_mimetype text DEFAULT NULL,
  _provider text DEFAULT 'cloud_api'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.media_fetch_jobs (
    company_id, instance_id, message_id, media_id, media_type, media_mimetype, provider
  ) VALUES (
    _company_id, _instance_id, _message_id, _media_id, _media_type, _media_mimetype, _provider
  )
  ON CONFLICT (company_id, message_id, media_id)
  DO UPDATE SET
    status = CASE WHEN public.media_fetch_jobs.status IN ('failed','dead') THEN 'pending' ELSE public.media_fetch_jobs.status END,
    next_attempt_at = LEAST(public.media_fetch_jobs.next_attempt_at, now()),
    updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.claim_media_fetch_jobs(_limit int DEFAULT 10)
RETURNS SETOF public.media_fetch_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.media_fetch_jobs
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.media_fetch_jobs m
     SET status = 'processing', picked_at = now(), attempts = attempts + 1, updated_at = now()
    FROM picked
   WHERE m.id = picked.id
   RETURNING m.*;
END $$;

CREATE OR REPLACE FUNCTION public.mark_media_fetch_done(_id uuid, _path text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.media_fetch_jobs
     SET status = 'done', storage_path = _path, last_error = NULL, updated_at = now()
   WHERE id = _id;
$$;

CREATE OR REPLACE FUNCTION public.mark_media_fetch_failed(_id uuid, _error text)
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
  SELECT attempts, max_attempts INTO v_attempts, v_max
    FROM public.media_fetch_jobs WHERE id = _id;

  IF v_attempts >= v_max THEN
    UPDATE public.media_fetch_jobs
       SET status = 'dead', last_error = _error, updated_at = now()
     WHERE id = _id;
    RETURN 'dead';
  END IF;

  v_delay := LEAST(POWER(2, v_attempts)::int * 30, 3600);
  UPDATE public.media_fetch_jobs
     SET status = 'pending',
         last_error = _error,
         next_attempt_at = now() + make_interval(secs => v_delay),
         updated_at = now()
   WHERE id = _id;
  RETURN 'pending';
END $$;
