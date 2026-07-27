
-- Deduplicate chat messages by external_id
DELETE FROM public.chat_messages
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY external_id ORDER BY id) as rn
    FROM public.chat_messages
    WHERE external_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- UNIQUE index on external_id for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_external_id_unique 
  ON public.chat_messages (external_id) 
  WHERE external_id IS NOT NULL;

-- Composite index for message ordering
CREATE INDEX IF NOT EXISTS idx_chat_messages_lead_sent_at 
  ON public.chat_messages (lead_id, sent_at ASC);

-- Event queue table
CREATE TABLE public.chat_event_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_message_id text,
  status text NOT NULL DEFAULT 'pending',
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  locked_until timestamptz
);

-- Conversation lock table
CREATE TABLE public.conversation_locks (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  locked_by text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 seconds')
);

-- Indices for event queue
CREATE INDEX idx_chat_event_queue_pending 
  ON public.chat_event_queue (status, created_at ASC) 
  WHERE status = 'pending';
CREATE INDEX idx_chat_event_queue_lead 
  ON public.chat_event_queue (lead_id, created_at ASC);

-- RLS
ALTER TABLE public.chat_event_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage event queue"
  ON public.chat_event_queue FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "Service can manage conversation locks"
  ON public.conversation_locks FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- Lock functions
CREATE OR REPLACE FUNCTION public.acquire_conversation_lock(
  _lead_id uuid, _locked_by text, _ttl_seconds integer DEFAULT 30
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.conversation_locks WHERE lead_id = _lead_id AND expires_at < now();
  INSERT INTO public.conversation_locks (lead_id, locked_by, locked_at, expires_at)
  VALUES (_lead_id, _locked_by, now(), now() + (_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (lead_id) DO NOTHING;
  RETURN EXISTS (SELECT 1 FROM public.conversation_locks WHERE lead_id = _lead_id AND locked_by = _locked_by);
END; $$;

CREATE OR REPLACE FUNCTION public.release_conversation_lock(
  _lead_id uuid, _locked_by text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.conversation_locks WHERE lead_id = _lead_id AND locked_by = _locked_by;
END; $$;

-- Idempotent message insert
CREATE OR REPLACE FUNCTION public.insert_message_idempotent(
  _company_id uuid, _lead_id uuid, _message text, _direction text, _external_id text,
  _message_type text DEFAULT 'text', _media_url text DEFAULT NULL, _media_type text DEFAULT NULL,
  _media_mimetype text DEFAULT NULL, _media_filename text DEFAULT NULL,
  _sent_at timestamptz DEFAULT now(), _status text DEFAULT 'sent'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _existing_id uuid; _new_id uuid;
BEGIN
  IF _external_id IS NOT NULL THEN
    SELECT id INTO _existing_id FROM public.chat_messages WHERE external_id = _external_id LIMIT 1;
    IF _existing_id IS NOT NULL THEN RETURN _existing_id; END IF;
  END IF;
  INSERT INTO public.chat_messages (company_id, lead_id, message, direction, external_id, message_type, media_url, media_type, media_mimetype, media_filename, sent_at, status)
  VALUES (_company_id, _lead_id, _message, _direction, _external_id, _message_type, _media_url, _media_type, _media_mimetype, _media_filename, _sent_at, _status)
  ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO _new_id;
  IF _new_id IS NULL AND _external_id IS NOT NULL THEN
    SELECT id INTO _new_id FROM public.chat_messages WHERE external_id = _external_id;
  END IF;
  RETURN _new_id;
END; $$;

-- Monotonic status update
CREATE OR REPLACE FUNCTION public.update_message_status_monotonic(
  _external_id text, _new_status text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _current_status text;
  _status_rank jsonb := '{"sent": 1, "delivered": 2, "read": 3}'::jsonb;
BEGIN
  SELECT status INTO _current_status FROM public.chat_messages WHERE external_id = _external_id LIMIT 1;
  IF _current_status IS NULL THEN RETURN false; END IF;
  IF COALESCE((_status_rank->>_new_status)::integer, 0) <= COALESCE((_status_rank->>_current_status)::integer, 0) THEN RETURN false; END IF;
  UPDATE public.chat_messages SET status = _new_status WHERE external_id = _external_id;
  RETURN true;
END; $$;

-- Realtime for event queue
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_event_queue;
