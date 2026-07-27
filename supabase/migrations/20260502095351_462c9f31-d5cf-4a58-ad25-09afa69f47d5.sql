CREATE OR REPLACE FUNCTION public.cancel_attendance_queue_bulk(
  _reason text DEFAULT 'Cancelamento em massa pelo admin',
  _company_id uuid DEFAULT NULL,
  _conversation_id uuid DEFAULT NULL,
  _message_kind text DEFAULT NULL,
  _older_than_minutes int DEFAULT NULL,
  _max_items int DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _is_master boolean;
  _user_company uuid;
  _scope_company uuid;
  _cancelled_ids uuid[];
  _cancelled_count int := 0;
  _cap int := COALESCE(LEAST(_max_items, 5000), 1000);
  _cutoff timestamptz;
BEGIN
  _is_master := public.is_master(auth.uid());
  _user_company := public.get_user_company_id(auth.uid());

  -- Permissão: master OU admin da empresa
  IF NOT _is_master AND NOT public.is_company_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;

  -- Resolve empresa-alvo
  IF _is_master THEN
    _scope_company := _company_id; -- pode ser NULL = todas
  ELSE
    -- não-master sempre limitado à própria empresa, ignora _company_id divergente
    _scope_company := _user_company;
    IF _company_id IS NOT NULL AND _company_id <> _user_company THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden_company');
    END IF;
  END IF;

  IF _older_than_minutes IS NOT NULL AND _older_than_minutes > 0 THEN
    _cutoff := now() - make_interval(mins => _older_than_minutes);
  END IF;

  -- Seleciona ids elegíveis com cap, lock para evitar race com worker
  WITH eligible AS (
    SELECT id
    FROM public.attendance_auto_message_queue
    WHERE status IN ('pending','processing')
      AND (_scope_company IS NULL OR company_id = _scope_company)
      AND (_conversation_id IS NULL OR conversation_id = _conversation_id)
      AND (_message_kind IS NULL OR message_kind = _message_kind)
      AND (_cutoff IS NULL OR created_at <= _cutoff)
    ORDER BY created_at ASC
    LIMIT _cap
    FOR UPDATE SKIP LOCKED
  ),
  upd AS (
    UPDATE public.attendance_auto_message_queue q
       SET status = 'failed',
           processed_at = now(),
           last_error = left(_reason, 500)
      FROM eligible e
     WHERE q.id = e.id
    RETURNING q.id, q.company_id, q.conversation_id, q.message_kind
  )
  SELECT array_agg(id), count(*)::int INTO _cancelled_ids, _cancelled_count FROM upd;

  IF _cancelled_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'cancelled', 0);
  END IF;

  -- Log agregado
  INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
  VALUES (
    COALESCE(_scope_company, _user_company),
    'attendance_auto', 'warn', 'manual_bulk_cancel',
    format('Cancelamento em massa: %s itens', _cancelled_count),
    jsonb_build_object(
      'count', _cancelled_count,
      'reason', _reason,
      'origin', 'manual_bulk_ui',
      'filters', jsonb_build_object(
        'company_id', _scope_company,
        'conversation_id', _conversation_id,
        'message_kind', _message_kind,
        'older_than_minutes', _older_than_minutes
      ),
      'cancelled_by', auth.uid()
    )
  );

  -- Tentativa por item (bypass RLS via SECURITY DEFINER)
  INSERT INTO public.attendance_auto_send_attempts(
    company_id, conversation_id, queue_id, message_kind, phase, origin,
    skip_reason, error_message, metadata
  )
  SELECT
    q.company_id, q.conversation_id, q.id, q.message_kind,
    'failed', 'manual_bulk_ui', 'manual_bulk_cancel', _reason,
    jsonb_build_object('cancelled_by', auth.uid(), 'batch_size', _cancelled_count)
  FROM public.attendance_auto_message_queue q
  WHERE q.id = ANY(_cancelled_ids);

  RETURN jsonb_build_object(
    'ok', true,
    'cancelled', _cancelled_count,
    'ids', _cancelled_ids
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_attendance_queue_bulk(text, uuid, uuid, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_attendance_queue_bulk(text, uuid, uuid, text, int, int) TO authenticated;