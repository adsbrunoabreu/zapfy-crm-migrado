-- =========================================================================
-- Fase 1b: RPC despachador dos 5 side-effects assíncronos
-- =========================================================================
-- Replica EXATAMENTE o corpo das 5 trigger functions, mas carregando a row
-- chat_messages por id em vez de receber NEW via trigger context.
-- Idempotente: cada efeito tem seus próprios guards (NEW.from_me etc).
-- =========================================================================

CREATE OR REPLACE FUNCTION public.run_chat_side_effect(
  _effect_type text,
  _chat_message_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _msg public.chat_messages%ROWTYPE;
  _event text;
  _supabase_url text;
  _service_role_key text;
  _url_match text;
  _enabled boolean;
  _project_url text := 'https://bupzemhjqzjlbsgmcdti.supabase.co';
  _service_key text;
  _lead_id uuid;
  _ticket_id uuid;
  _rating public.attendance_ticket_ratings;
  _txt text;
  _num numeric;
  _max numeric;
BEGIN
  SELECT * INTO _msg FROM public.chat_messages WHERE id = _chat_message_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- ====================================================================
  -- 1) webhook  (espelha trg_fn_webhook_chat_message)
  -- ====================================================================
  IF _effect_type = 'webhook' THEN
    _event := CASE WHEN _msg.from_me THEN 'message.sent' ELSE 'message.received' END;
    PERFORM public.enqueue_webhook_event(
      _msg.company_id,
      _event,
      jsonb_build_object(
        'message_id',           _msg.id,
        'conversation_id',      _msg.conversation_id,
        'remote_jid',           _msg.remote_jid,
        'message_type',         _msg.message_type,
        'content',              _msg.content,
        'from_me',              _msg.from_me,
        'status',               _msg.status,
        'media_storage_path',   _msg.media_storage_path,
        'media_mimetype',       _msg.media_mimetype,
        'file_name',            _msg.file_name,
        'duration',             _msg.duration,
        'sender_name',          _msg.sender_name,
        'timestamp',            _msg.timestamp,
        'provider_message_id',  _msg.provider_message_id
      )
    );

  -- ====================================================================
  -- 2) link_preview  (espelha trigger_extract_link_preview)
  -- ====================================================================
  ELSIF _effect_type = 'link_preview' THEN
    IF _msg.message_type IS DISTINCT FROM 'text' THEN RETURN; END IF;
    IF _msg.link_preview IS NOT NULL THEN RETURN; END IF;
    IF _msg.content IS NULL OR length(_msg.content) = 0 THEN RETURN; END IF;

    _url_match := substring(_msg.content from 'https?://[^\s<>"'']+');
    IF _url_match IS NULL THEN RETURN; END IF;

    SELECT decrypted_secret INTO _supabase_url
      FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
    SELECT decrypted_secret INTO _service_role_key
      FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;
    IF _supabase_url IS NULL OR _service_role_key IS NULL THEN RETURN; END IF;

    PERFORM net.http_post(
      url := _supabase_url || '/functions/v1/extract-link-preview',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_role_key
      ),
      body := jsonb_build_object('message_id', _msg.id, 'url', _url_match)
    );

  -- ====================================================================
  -- 3) ai_agent  (espelha invoke_ai_agent_on_message)
  -- ====================================================================
  ELSIF _effect_type = 'ai_agent' THEN
    IF _msg.from_me THEN RETURN; END IF;
    IF COALESCE(_msg.content, '') = '' AND _msg.message_type <> 'audio' THEN RETURN; END IF;

    SELECT public.is_ai_agent_enabled(_msg.company_id) INTO _enabled;
    IF NOT _enabled THEN RETURN; END IF;

    UPDATE public.conversation_ai_state
       SET last_inbound_at = now(),
           pending_since = COALESCE(pending_since, now())
     WHERE conversation_id = _msg.conversation_id;

    _service_key := public._get_service_role_key();
    IF _service_key IS NULL THEN
      RAISE WARNING 'run_chat_side_effect(ai_agent): service role key ausente no vault';
      RETURN;
    END IF;

    PERFORM net.http_post(
      url := _project_url || '/functions/v1/ai-agent-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-key', _service_key
      ),
      body := jsonb_build_object(
        'conversation_id', _msg.conversation_id,
        'trigger_message_id', _msg.id,
        'inbound_at', extract(epoch from now())
      )
    );

  -- ====================================================================
  -- 4) set_lead_responded  (espelha set_lead_responded_at)
  -- ====================================================================
  ELSIF _effect_type = 'set_lead_responded' THEN
    IF NOT _msg.from_me THEN RETURN; END IF;

    SELECT lead_id INTO _lead_id
    FROM public.conversations WHERE id = _msg.conversation_id;
    IF _lead_id IS NULL THEN RETURN; END IF;

    UPDATE public.leads
       SET responded_at = COALESCE(_msg.timestamp, _msg.created_at, now())
     WHERE id = _lead_id
       AND responded_at IS NULL
       AND status NOT IN ('won','lost');

  -- ====================================================================
  -- 5) capture_rating  (espelha capture_rating_response_from_message)
  -- ====================================================================
  ELSIF _effect_type = 'capture_rating' THEN
    IF _msg.from_me THEN RETURN; END IF;

    SELECT id INTO _ticket_id FROM public.attendance_tickets
     WHERE conversation_id = _msg.conversation_id
     ORDER BY created_at DESC LIMIT 1;
    IF _ticket_id IS NULL THEN RETURN; END IF;

    SELECT * INTO _rating FROM public.attendance_ticket_ratings
     WHERE ticket_id = _ticket_id AND status = 'pending'
     ORDER BY requested_at DESC LIMIT 1;
    IF NOT FOUND THEN RETURN; END IF;

    _txt := COALESCE(_msg.content, '');
    IF length(_txt) = 0 OR length(_txt) > 200 THEN RETURN; END IF;

    IF _txt ~ '(😀|😄|😊|🙂|👍|❤️|⭐⭐⭐⭐⭐)' THEN
      _num := 5;
    ELSIF _txt ~ '(😐|😑|🤔|⭐⭐⭐)' THEN
      _num := 3;
    ELSIF _txt ~ '(😞|😠|😡|☹️|👎|⭐)' THEN
      _num := 1;
    ELSE
      _num := NULLIF((regexp_match(_txt, '(\d+(?:[.,]\d+)?)'))[1], '')::numeric;
    END IF;
    IF _num IS NULL THEN RETURN; END IF;

    _max := CASE _rating.scale WHEN 'nps' THEN 10 WHEN 'numeric' THEN 5 ELSE 5 END;
    IF _num < 0 OR _num > _max THEN RETURN; END IF;

    IF _rating.response_window_hours > 0
       AND _rating.requested_at < now() - make_interval(hours => _rating.response_window_hours) THEN
      UPDATE public.attendance_ticket_ratings SET status = 'expired' WHERE id = _rating.id;
      UPDATE public.attendance_tickets
         SET status = 'closed'::ticket_status,
             closed_at = now(),
             rating_deadline = NULL,
             close_reason = COALESCE(close_reason, 'Encerrado após expiração da avaliação')
       WHERE id = _ticket_id AND status = 'awaiting_rating'::ticket_status;
      RETURN;
    END IF;

    UPDATE public.attendance_ticket_ratings
       SET score = _num,
           raw_response = _txt,
           responded_at = COALESCE(_msg.timestamp, now()),
           status = 'responded'
     WHERE id = _rating.id;

    UPDATE public.attendance_tickets
       SET status = 'closed'::ticket_status,
           closed_at = now(),
           rating_deadline = NULL,
           close_reason = COALESCE(close_reason, 'Encerrado após avaliação')
     WHERE id = _ticket_id AND status = 'awaiting_rating'::ticket_status;

  ELSE
    RAISE EXCEPTION 'unknown_effect_type: %', _effect_type;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.run_chat_side_effect(text, uuid) FROM PUBLIC, anon, authenticated;