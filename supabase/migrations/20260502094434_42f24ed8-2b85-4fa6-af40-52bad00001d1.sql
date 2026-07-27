CREATE OR REPLACE FUNCTION public.cancel_attendance_queue_item(_queue_id uuid, _reason text DEFAULT 'Cancelado manualmente pelo admin')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row record;
  _is_master boolean;
  _user_company uuid;
BEGIN
  SELECT * INTO _row FROM public.attendance_auto_message_queue WHERE id = _queue_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'queue_item_not_found');
  END IF;

  _is_master := public.is_master(auth.uid());
  _user_company := public.get_user_company_id(auth.uid());

  IF NOT _is_master AND _row.company_id <> _user_company THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF NOT _is_master AND NOT public.is_company_admin(auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_role');
  END IF;

  IF _row.status NOT IN ('pending','processing') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_finished', 'status', _row.status);
  END IF;

  UPDATE public.attendance_auto_message_queue
     SET status = 'failed',
         processed_at = now(),
         last_error = left(_reason, 500)
   WHERE id = _queue_id;

  INSERT INTO public.system_logs(company_id, source, level, event, message, metadata)
  VALUES (_row.company_id, 'attendance_auto', 'warn', 'manual_cancel',
          'Item de fila cancelado manualmente',
          jsonb_build_object(
            'queue_id', _queue_id,
            'conversation_id', _row.conversation_id,
            'kind', _row.message_kind,
            'reason', _reason,
            'origin', 'manual_replay_ui',
            'cancelled_by', auth.uid()
          ));

  -- Bypass RLS via SECURITY DEFINER
  INSERT INTO public.attendance_auto_send_attempts(
    company_id, conversation_id, queue_id, message_kind, phase, origin,
    skip_reason, error_message, metadata
  ) VALUES (
    _row.company_id, _row.conversation_id, _queue_id, _row.message_kind,
    'failed', 'manual_replay_ui', 'manual_cancel', _reason,
    jsonb_build_object('cancelled_by', auth.uid())
  );

  RETURN jsonb_build_object('ok', true, 'queue_id', _queue_id);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_attendance_queue_item(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_attendance_queue_item(uuid, text) TO authenticated;