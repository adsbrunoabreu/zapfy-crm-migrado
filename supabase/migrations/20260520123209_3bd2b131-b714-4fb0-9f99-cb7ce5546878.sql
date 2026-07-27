
-- =========================================================================
-- GRANULAR RLS por papel: Gestor (write operacional) + Financeiro
-- =========================================================================

-- ai_agent_history
DROP POLICY IF EXISTS "Company admins insert own history" ON public.ai_agent_history;
DROP POLICY IF EXISTS "Company admins view own history" ON public.ai_agent_history;
CREATE POLICY "Tenant read ai_agent_history" ON public.ai_agent_history
  FOR SELECT USING (can_read_company_data(auth.uid(), company_id));
CREATE POLICY "Managers insert ai_agent_history" ON public.ai_agent_history
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );

-- ai_agent_limits
DROP POLICY IF EXISTS "Company admins insert own limits" ON public.ai_agent_limits;
DROP POLICY IF EXISTS "Company admins update own limits" ON public.ai_agent_limits;
DROP POLICY IF EXISTS "Company admins view own limits" ON public.ai_agent_limits;
CREATE POLICY "Tenant read ai_agent_limits" ON public.ai_agent_limits
  FOR SELECT USING (can_read_company_data(auth.uid(), company_id));
CREATE POLICY "Managers insert ai_agent_limits" ON public.ai_agent_limits
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update ai_agent_limits" ON public.ai_agent_limits
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- ai_agent_runs
DROP POLICY IF EXISTS "Company admins view ai_runs" ON public.ai_agent_runs;
CREATE POLICY "Tenant read ai_agent_runs" ON public.ai_agent_runs
  FOR SELECT USING (can_read_company_data(auth.uid(), company_id));

-- ai_agents
DROP POLICY IF EXISTS "Company admins delete ai_agents" ON public.ai_agents;
DROP POLICY IF EXISTS "Company admins insert ai_agents when enabled" ON public.ai_agents;
DROP POLICY IF EXISTS "Company admins update ai_agents when enabled" ON public.ai_agents;
CREATE POLICY "Managers delete ai_agents" ON public.ai_agents
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers insert ai_agents when enabled" ON public.ai_agents
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_ai_agent_enabled(company_id)
  );
CREATE POLICY "Managers update ai_agents when enabled" ON public.ai_agents
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_ai_agent_enabled(company_id)
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_ai_agent_enabled(company_id)
  );

-- ai_knowledge_documents
DROP POLICY IF EXISTS "Admins delete own kb docs" ON public.ai_knowledge_documents;
DROP POLICY IF EXISTS "Admins insert own kb docs" ON public.ai_knowledge_documents;
DROP POLICY IF EXISTS "Admins update own kb docs" ON public.ai_knowledge_documents;
CREATE POLICY "Managers delete own kb docs" ON public.ai_knowledge_documents
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers insert own kb docs" ON public.ai_knowledge_documents
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_ai_agent_enabled(company_id)
  );
CREATE POLICY "Managers update own kb docs" ON public.ai_knowledge_documents
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- appointment_professionals
DROP POLICY IF EXISTS "Admins delete professionals" ON public.appointment_professionals;
DROP POLICY IF EXISTS "Admins manage professionals" ON public.appointment_professionals;
DROP POLICY IF EXISTS "Admins update professionals" ON public.appointment_professionals;
CREATE POLICY "Managers delete professionals" ON public.appointment_professionals
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers insert professionals" ON public.appointment_professionals
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update professionals" ON public.appointment_professionals
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- appointment_reasons
DROP POLICY IF EXISTS "Admins delete reasons" ON public.appointment_reasons;
DROP POLICY IF EXISTS "Admins insert reasons" ON public.appointment_reasons;
DROP POLICY IF EXISTS "Admins update reasons" ON public.appointment_reasons;
CREATE POLICY "Managers delete reasons" ON public.appointment_reasons
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers insert reasons" ON public.appointment_reasons
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update reasons" ON public.appointment_reasons
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- attendance_settings
DROP POLICY IF EXISTS "Company admins can delete attendance settings" ON public.attendance_settings;
DROP POLICY IF EXISTS "Company admins can insert attendance settings" ON public.attendance_settings;
DROP POLICY IF EXISTS "Company admins can update attendance settings" ON public.attendance_settings;
CREATE POLICY "Managers delete attendance settings" ON public.attendance_settings
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers insert attendance settings" ON public.attendance_settings
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update attendance settings" ON public.attendance_settings
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );

-- attendance_tickets
DROP POLICY IF EXISTS "Admins delete tickets" ON public.attendance_tickets;
DROP POLICY IF EXISTS "Assignee or admin can update tickets" ON public.attendance_tickets;
CREATE POLICY "Managers delete tickets" ON public.attendance_tickets
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Assignee or manager can update tickets" ON public.attendance_tickets
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
    AND (
      is_company_manager(auth.uid())
      OR assigned_to = auth.uid()
      OR assigned_to IS NULL
    )
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND (
      is_company_manager(auth.uid())
      OR assigned_to = auth.uid()
      OR assigned_to IS NULL
    )
  );

-- coexistence_history_chunks
DROP POLICY IF EXISTS "admins can view coex chunks" ON public.coexistence_history_chunks;
CREATE POLICY "Tenant read coex chunks" ON public.coexistence_history_chunks
  FOR SELECT USING (can_read_company_data(auth.uid(), company_id));

-- conversations
DROP POLICY IF EXISTS "Admins can delete conversations" ON public.conversations;
CREATE POLICY "Managers delete conversations" ON public.conversations
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- instance_agents
DROP POLICY IF EXISTS "Admins manage instance agents" ON public.instance_agents;
CREATE POLICY "Tenant read instance agents" ON public.instance_agents
  FOR SELECT USING (can_read_company_data(auth.uid(), company_id));
CREATE POLICY "Managers insert instance agents" ON public.instance_agents
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update instance agents" ON public.instance_agents
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers delete instance agents" ON public.instance_agents
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- instance_events
DROP POLICY IF EXISTS "Company admins can view own instance events" ON public.instance_events;
CREATE POLICY "Tenant read instance events" ON public.instance_events
  FOR SELECT USING (can_read_company_data(auth.uid(), company_id));

-- lead_distribution_settings
DROP POLICY IF EXISTS "Company admins can manage distribution settings" ON public.lead_distribution_settings;
CREATE POLICY "Tenant read distribution settings" ON public.lead_distribution_settings
  FOR SELECT USING (can_read_company_data(auth.uid(), company_id));
CREATE POLICY "Managers insert distribution settings" ON public.lead_distribution_settings
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update distribution settings" ON public.lead_distribution_settings
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers delete distribution settings" ON public.lead_distribution_settings
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- lead_distribution_users
DROP POLICY IF EXISTS "Company admins can manage distribution users" ON public.lead_distribution_users;
CREATE POLICY "Tenant read distribution users" ON public.lead_distribution_users
  FOR SELECT USING (can_read_company_data(auth.uid(), company_id));
CREATE POLICY "Managers insert distribution users" ON public.lead_distribution_users
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update distribution users" ON public.lead_distribution_users
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers delete distribution users" ON public.lead_distribution_users
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- leads
DROP POLICY IF EXISTS "Company admins can delete leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update company leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view company leads" ON public.leads;
CREATE POLICY "Tenant read leads" ON public.leads
  FOR SELECT USING (
    is_master(auth.uid())
    OR can_read_company_data(auth.uid(), company_id)
    OR (company_id = get_user_company_id(auth.uid()) AND assigned_to = auth.uid())
  );
CREATE POLICY "Tenant members update leads" ON public.leads
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
    AND (is_company_manager(auth.uid()) OR assigned_to = auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND (is_company_manager(auth.uid()) OR assigned_to = auth.uid())
  );
CREATE POLICY "Managers delete leads" ON public.leads
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- message_sequence_enrollments
DROP POLICY IF EXISTS "Admins delete enrollments" ON public.message_sequence_enrollments;
CREATE POLICY "Managers delete enrollments" ON public.message_sequence_enrollments
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- message_sequence_steps (derived via sequence_id)
DROP POLICY IF EXISTS "Admins manage steps" ON public.message_sequence_steps;
CREATE POLICY "Managers manage steps" ON public.message_sequence_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM message_sequences s
      WHERE s.id = message_sequence_steps.sequence_id
        AND s.company_id = get_user_company_id(auth.uid())
        AND is_company_manager(auth.uid())
        AND is_company_active(s.company_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM message_sequences s
      WHERE s.id = message_sequence_steps.sequence_id
        AND s.company_id = get_user_company_id(auth.uid())
        AND is_company_manager(auth.uid())
        AND is_company_active(s.company_id)
    )
  );

-- message_sequences
DROP POLICY IF EXISTS "Admins delete sequences" ON public.message_sequences;
DROP POLICY IF EXISTS "Admins insert sequences" ON public.message_sequences;
DROP POLICY IF EXISTS "Admins update sequences" ON public.message_sequences;
CREATE POLICY "Managers delete sequences" ON public.message_sequences
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers insert sequences" ON public.message_sequences
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update sequences" ON public.message_sequences
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- message_templates
DROP POLICY IF EXISTS "Admins delete templates" ON public.message_templates;
DROP POLICY IF EXISTS "Admins insert templates" ON public.message_templates;
DROP POLICY IF EXISTS "Admins update templates" ON public.message_templates;
CREATE POLICY "Managers delete templates" ON public.message_templates
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers insert templates" ON public.message_templates
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update templates" ON public.message_templates
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- pipeline_members (derived via pipeline_id)
DROP POLICY IF EXISTS "Company admins manage pipeline members" ON public.pipeline_members;
CREATE POLICY "Managers manage pipeline members" ON public.pipeline_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_members.pipeline_id
        AND p.company_id = get_user_company_id(auth.uid())
        AND is_company_manager(auth.uid())
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_members.pipeline_id
        AND p.company_id = get_user_company_id(auth.uid())
        AND is_company_manager(auth.uid())
    )
  );

-- pipeline_stages (derived via pipeline_id)
DROP POLICY IF EXISTS "Company admins can manage stages" ON public.pipeline_stages;
DROP POLICY IF EXISTS "Users can view company stages" ON public.pipeline_stages;
CREATE POLICY "Tenant read stages" ON public.pipeline_stages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND (
          is_master(auth.uid())
          OR can_read_company_data(auth.uid(), p.company_id)
          OR (p.company_id = get_user_company_id(auth.uid())
              AND (NOT pipeline_has_members(p.id) OR is_pipeline_member(auth.uid(), p.id)))
        )
    )
  );
CREATE POLICY "Managers manage stages" ON public.pipeline_stages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND p.company_id = get_user_company_id(auth.uid())
        AND is_company_manager(auth.uid())
        AND is_company_active(p.company_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND p.company_id = get_user_company_id(auth.uid())
        AND is_company_manager(auth.uid())
        AND is_company_active(p.company_id)
    )
  );

-- pipelines
DROP POLICY IF EXISTS "Company admins can manage pipelines" ON public.pipelines;
DROP POLICY IF EXISTS "Users can view company pipelines" ON public.pipelines;
CREATE POLICY "Tenant read pipelines" ON public.pipelines
  FOR SELECT USING (
    is_master(auth.uid())
    OR can_read_company_data(auth.uid(), company_id)
    OR (company_id = get_user_company_id(auth.uid())
        AND (NOT pipeline_has_members(id) OR is_pipeline_member(auth.uid(), id)))
  );
CREATE POLICY "Managers insert pipelines" ON public.pipelines
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update pipelines" ON public.pipelines
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers delete pipelines" ON public.pipelines
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- professional_report_preferences
DROP POLICY IF EXISTS "Admins delete prefs" ON public.professional_report_preferences;
DROP POLICY IF EXISTS "Admins insert prefs" ON public.professional_report_preferences;
DROP POLICY IF EXISTS "Admins update prefs" ON public.professional_report_preferences;
CREATE POLICY "Managers delete prefs" ON public.professional_report_preferences
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers insert prefs" ON public.professional_report_preferences
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update prefs" ON public.professional_report_preferences
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- tags
DROP POLICY IF EXISTS "Company admins can manage tags" ON public.tags;
CREATE POLICY "Tenant read tags" ON public.tags
  FOR SELECT USING (can_read_company_data(auth.uid(), company_id));
CREATE POLICY "Managers insert tags" ON public.tags
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update tags" ON public.tags
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers delete tags" ON public.tags
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- ticket_supervisor_alerts
DROP POLICY IF EXISTS "Admins view supervisor alerts" ON public.ticket_supervisor_alerts;
CREATE POLICY "Tenant read supervisor alerts" ON public.ticket_supervisor_alerts
  FOR SELECT USING (can_read_company_data(auth.uid(), company_id));

-- user_goals
DROP POLICY IF EXISTS "Company admins can manage goals" ON public.user_goals;
DROP POLICY IF EXISTS "Users can view own goals" ON public.user_goals;
CREATE POLICY "Tenant read goals" ON public.user_goals
  FOR SELECT USING (
    can_read_company_data(auth.uid(), company_id)
    OR user_id = auth.uid()
  );
CREATE POLICY "Managers insert goals" ON public.user_goals
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update goals" ON public.user_goals
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers delete goals" ON public.user_goals
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- whatsapp_instances
DROP POLICY IF EXISTS "Company admins can manage instances" ON public.whatsapp_instances;
CREATE POLICY "Managers insert instances" ON public.whatsapp_instances
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
    AND is_company_active(company_id)
  );
CREATE POLICY "Managers update instances" ON public.whatsapp_instances
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  ) WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );
CREATE POLICY "Managers delete instances" ON public.whatsapp_instances
  FOR DELETE USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_manager(auth.uid())
  );

-- ===== GROUP B: Financeiro =====

DROP POLICY IF EXISTS "Company admin sees own asaas logs" ON public.asaas_logs;
CREATE POLICY "Finance reads asaas logs" ON public.asaas_logs
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_finance(auth.uid())
  );

DROP POLICY IF EXISTS "Company admins view own addons" ON public.company_addons;
CREATE POLICY "Finance reads addons" ON public.company_addons
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_finance(auth.uid())
  );

DROP POLICY IF EXISTS "Company admins view own invoices" ON public.invoices;
CREATE POLICY "Finance reads invoices" ON public.invoices
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_finance(auth.uid())
  );

DROP POLICY IF EXISTS "Company admin reads own payment_attempts" ON public.payment_attempts;
CREATE POLICY "Finance reads payment attempts" ON public.payment_attempts
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_finance(auth.uid())
  );

DROP POLICY IF EXISTS "Company admins view active plans" ON public.subscription_plans;
CREATE POLICY "Finance views active plans" ON public.subscription_plans
  FOR SELECT USING (is_company_finance(auth.uid()) AND is_active = true);

DROP POLICY IF EXISTS "Company admins can view own subscription" ON public.subscriptions;
CREATE POLICY "Finance reads subscription" ON public.subscriptions
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    AND is_company_finance(auth.uid())
  );
