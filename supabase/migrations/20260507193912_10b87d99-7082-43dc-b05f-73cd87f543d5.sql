
CREATE INDEX IF NOT EXISTS idx_msg_sync_log_provider_event
  ON public.message_sync_log (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_msg_sync_log_meta_pmid
  ON public.message_sync_log ((metadata->>'provider_message_id'))
  WHERE metadata ? 'provider_message_id';

CREATE INDEX IF NOT EXISTS idx_msg_sync_log_meta_mid
  ON public.message_sync_log ((metadata->>'message_id'))
  WHERE metadata ? 'message_id';

CREATE INDEX IF NOT EXISTS idx_chat_messages_company_created
  ON public.chat_messages (company_id, created_at DESC);

CREATE OR REPLACE FUNCTION public._can_audit_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_master(auth.uid())
      OR (
        public.is_company_admin(auth.uid())
        AND public.get_user_company_id(auth.uid()) = _company_id
      );
$$;

CREATE OR REPLACE FUNCTION public.get_message_audit_list(
  _company_id uuid,
  _conversation_id uuid DEFAULT NULL,
  _lead_id uuid DEFAULT NULL,
  _from_ts timestamptz DEFAULT NULL,
  _to_ts timestamptz DEFAULT NULL,
  _status text DEFAULT NULL,
  _search text DEFAULT NULL,
  _direction text DEFAULT NULL,
  _limit int DEFAULT 50,
  _offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  company_id uuid,
  conversation_id uuid,
  message_id text,
  provider_message_id text,
  provider text,
  message_type text,
  content text,
  status text,
  from_me boolean,
  sender_name text,
  remote_jid text,
  "timestamp" timestamptz,
  created_at timestamptz,
  webhook_received_at timestamptz,
  sync_error text,
  lead_id uuid,
  lead_name text,
  events_count bigint,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._can_audit_company(_company_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT m.*, c.lead_id AS conv_lead_id
    FROM public.chat_messages m
    LEFT JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.company_id = _company_id
      AND (_conversation_id IS NULL OR m.conversation_id = _conversation_id)
      AND (_lead_id IS NULL OR c.lead_id = _lead_id)
      AND (_from_ts IS NULL OR m.created_at >= _from_ts)
      AND (_to_ts IS NULL OR m.created_at <= _to_ts)
      AND (_status IS NULL OR m.status = _status)
      AND (_direction IS NULL
           OR (_direction = 'out' AND m.from_me = true)
           OR (_direction = 'in' AND m.from_me = false))
      AND (
        _search IS NULL OR _search = '' OR
        m.content ILIKE '%' || _search || '%' OR
        m.message_id = _search OR
        m.provider_message_id = _search
      )
  ),
  total AS (SELECT count(*)::bigint AS c FROM base)
  SELECT
    b.id, b.company_id, b.conversation_id, b.message_id, b.provider_message_id,
    b.provider, b.message_type, b.content, b.status, b.from_me, b.sender_name,
    b.remote_jid, b."timestamp", b.created_at, b.webhook_received_at, b.sync_error,
    b.conv_lead_id AS lead_id,
    l.name AS lead_name,
    (
      SELECT count(*)::bigint FROM public.message_sync_log s
      WHERE s.company_id = b.company_id
        AND (
          (b.provider_message_id IS NOT NULL AND s.metadata->>'provider_message_id' = b.provider_message_id)
          OR (b.message_id IS NOT NULL AND s.metadata->>'message_id' = b.message_id)
        )
    ) AS events_count,
    (SELECT c FROM total) AS total_count
  FROM base b
  LEFT JOIN public.leads l ON l.id = b.conv_lead_id
  ORDER BY b.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 200))
  OFFSET GREATEST(0, _offset);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_message_audit_timeline(_message_pk uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg public.chat_messages%ROWTYPE;
  events jsonb;
BEGIN
  SELECT * INTO msg FROM public.chat_messages WHERE id = _message_pk;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public._can_audit_company(msg.company_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  WITH derived AS (
    SELECT * FROM (VALUES
      (msg.created_at, 'persisted'::text, 'success'::text,
        'Mensagem persistida em chat_messages'::text,
        jsonb_build_object('status', msg.status, 'message_type', msg.message_type)),
      (msg.webhook_received_at, 'webhook.received'::text, 'success'::text,
        'Webhook recebido pelo provedor'::text,
        jsonb_build_object('provider', msg.provider)),
      (CASE WHEN msg.sync_error IS NOT NULL THEN msg.created_at END,
        'sync.error'::text, 'error'::text, COALESCE(msg.sync_error, '')::text,
        jsonb_build_object('sync_error', msg.sync_error))
    ) AS v(ts, event, status, description, metadata)
    WHERE v.ts IS NOT NULL
  ),
  logs AS (
    SELECT
      s.created_at AS ts,
      s.event,
      s.status,
      COALESCE(s.error_message, s.message_content, s.event) AS description,
      s.metadata
    FROM public.message_sync_log s
    WHERE s.company_id = msg.company_id
      AND (
        (msg.provider_message_id IS NOT NULL AND s.metadata->>'provider_message_id' = msg.provider_message_id)
        OR (msg.message_id IS NOT NULL AND s.metadata->>'message_id' = msg.message_id)
      )
  ),
  unioned AS (
    SELECT ts, event, status, description, metadata FROM derived
    UNION ALL
    SELECT ts, event, status, description, metadata FROM logs
  )
  SELECT jsonb_agg(jsonb_build_object(
    'ts', ts,
    'event', event,
    'status', status,
    'description', description,
    'metadata', metadata
  ) ORDER BY ts ASC)
  INTO events
  FROM unioned;

  RETURN jsonb_build_object(
    'message', to_jsonb(msg),
    'events', COALESCE(events, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_message_audit_list(uuid,uuid,uuid,timestamptz,timestamptz,text,text,text,int,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_message_audit_timeline(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public._can_audit_company(uuid) TO authenticated;
