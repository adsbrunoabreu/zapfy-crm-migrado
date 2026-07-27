CREATE OR REPLACE FUNCTION public.wipe_company_operational(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_counts jsonb := '{}'::jsonb;
  v_n int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'master') THEN
    RAISE EXCEPTION 'Apenas Master pode executar wipe' USING ERRCODE = '42501';
  END IF;
  IF p_company_id IS NULL THEN RAISE EXCEPTION 'company_id é obrigatório'; END IF;

  SET LOCAL session_replication_role = 'replica';

  DELETE FROM public.attendance_ticket_assignments
    WHERE ticket_id IN (SELECT id FROM public.attendance_tickets WHERE company_id = p_company_id);
  DELETE FROM public.attendance_ticket_events
    WHERE ticket_id IN (SELECT id FROM public.attendance_tickets WHERE company_id = p_company_id);
  DELETE FROM public.attendance_ticket_ratings WHERE company_id = p_company_id;
  DELETE FROM public.ticket_supervisor_alerts
    WHERE ticket_id IN (SELECT id FROM public.attendance_tickets WHERE company_id = p_company_id);
  DELETE FROM public.attendance_tickets WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('tickets', v_n);

  DELETE FROM public.attendance_auto_send_attempts WHERE company_id = p_company_id;
  DELETE FROM public.attendance_auto_message_queue WHERE company_id = p_company_id;

  DELETE FROM public.appointment_reminders WHERE company_id = p_company_id;
  DELETE FROM public.appointments WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('appointments', v_n);

  DELETE FROM public.message_sync_log WHERE company_id = p_company_id;
  DELETE FROM public.chat_messages WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('messages', v_n);

  DELETE FROM public.conversations WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('conversations', v_n);

  DELETE FROM public.message_sequence_enrollments
    WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_company_id);
  DELETE FROM public.scheduled_messages WHERE company_id = p_company_id;

  DELETE FROM public.lead_tags
    WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_company_id);
  DELETE FROM public.lead_history
    WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_company_id);
  DELETE FROM public.lead_activities
    WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_company_id);
  DELETE FROM public.lead_attachments
    WHERE lead_id IN (SELECT id FROM public.leads WHERE company_id = p_company_id);
  DELETE FROM public.leads WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('leads', v_n);

  DELETE FROM public.user_goals WHERE company_id = p_company_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_counts := v_counts || jsonb_build_object('goals', v_n);

  RETURN jsonb_build_object('ok', true, 'company_id', p_company_id, 'deleted', v_counts);
END;
$$;