-- 1. Função mais sensível: chave de service_role
REVOKE EXECUTE ON FUNCTION public._get_service_role_key() FROM authenticated, anon, PUBLIC;

-- 2. Triggers internos / workers / helpers que não devem ser RPC pelo frontend
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'ai_agent_pipeline_checklist','ai_agents_snapshot_history','appointments_audit',
    'appointments_set_defaults','appointments_sync_reminders','auto_triage_on_conversation_insert',
    'cancel_disabled_attendance_queue','cleanup_asaas_logs','conversations_link_contact',
    'create_company_onboarding','detect_manual_value_edit','enforce_max_instances',
    'enforce_max_leads','enforce_max_users','enforce_pipelines_plan_limit',
    'enforce_single_featured_plan','flush_pending_status_updates','get_alert_cron_frequencies',
    'get_alert_cron_status','get_companies_due_for_billing','get_company_usage_overview',
    'get_database_overview','get_finance_pending_receivables','get_messaging_health_metrics',
    'get_trial_reminder_targets','get_user_unread_conversations_count',
    'guard_subscription_cancellation','invoke_ai_agent_on_message','lead_attachments_audit_tg',
    'lead_procedures_set_price_snapshot','leads_finance_audit_tg','leads_status_change_log',
    'log_attendance_ticket_assignment','log_attendance_ticket_event','next_invoice_number',
    'notify_attempt_webhook','notify_n8n_lead_webhook','notify_today_birthdays',
    'pause_ai_on_human_takeover','presence_heartbeat','presence_set_offline',
    'prevent_lead_create_in_closed_stage','propagate_lead_name_to_conversations',
    'propagate_procedure_base_price','reactivate_my_subscription','recalc_lead_value_from_procedures',
    'renew_due_subscriptions','reopen_conversation_on_new_message','set_contact_tenant_seq',
    'set_default_lead_stage','set_lead_medical_notes_defaults','set_lead_procedures_defaults',
    'set_lead_responded_at','set_lead_tenant_seq','sync_company_addons','sync_company_ai_addon',
    'sync_conversation_closed_at_from_ticket','sync_conversation_name_from_lead',
    'sync_lead_insurance_text','sync_lead_legacy_procedure','sync_lead_stage_from_status',
    'sync_lead_status_from_stage','sync_lead_to_contact','sync_lead_to_medical',
    'sync_professional_to_medical_doctor','tg_ai_agent_snapshot','tg_appointment_to_financial_entry',
    'tg_lead_history_on_lead_insert','tg_lead_history_on_lead_tag','tg_lead_history_on_lead_update',
    'tg_lead_history_on_ticket','tg_lead_won_create_receivable','tg_new_company_financial_seed',
    'trg_auto_distribute_lead','trg_companies_seed_lead_sources','trg_fn_webhook_chat_message',
    'trg_fn_webhook_lead_created','trg_fn_webhook_lead_stage_changed','trg_fn_webhook_lead_transferred',
    'trg_fn_webhook_lead_updated','trg_fn_webhook_secret_protect','trg_seq_cancel_on_reply',
    'trg_seq_cancel_on_status','trg_seq_on_lead_created','trg_seq_on_stage_changed',
    'trg_seq_on_tag_added','trigger_extract_link_preview','trigger_webhook_dispatch',
    'unarchive_and_reopen_on_message'
  ];
  r record;
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    FOR r IN
      SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = fn
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated, anon, PUBLIC', r.sig);
    END LOOP;
  END LOOP;
END $$;