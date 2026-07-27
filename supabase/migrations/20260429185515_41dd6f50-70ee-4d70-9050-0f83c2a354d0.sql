-- Remover policies SELECT que exigem plano ativo e recriar permitindo leitura
-- (escrita continua bloqueada pelas policies INSERT/UPDATE/DELETE existentes)

-- LEADS
DROP POLICY IF EXISTS "Users can view company leads" ON public.leads;
CREATE POLICY "Users can view company leads" ON public.leads
FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR (company_id = get_user_company_id(auth.uid())
      AND (is_company_admin(auth.uid()) OR assigned_to = auth.uid()))
);

-- PIPELINES
DROP POLICY IF EXISTS "Users can view company pipelines" ON public.pipelines;
CREATE POLICY "Users can view company pipelines" ON public.pipelines
FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR company_id = get_user_company_id(auth.uid())
);

-- PIPELINE_STAGES
DROP POLICY IF EXISTS "Users can view company stages" ON public.pipeline_stages;
CREATE POLICY "Users can view company stages" ON public.pipeline_stages
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_stages.pipeline_id
      AND (is_master(auth.uid()) OR p.company_id = get_user_company_id(auth.uid()))
  )
);

-- CONVERSATIONS
DROP POLICY IF EXISTS "Users can view company conversations" ON public.conversations;
CREATE POLICY "Users can view company conversations" ON public.conversations
FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR company_id = get_user_company_id(auth.uid())
);

-- CHAT_MESSAGES
DROP POLICY IF EXISTS "Users can view company messages" ON public.chat_messages;
CREATE POLICY "Users can view company messages" ON public.chat_messages
FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR company_id = get_user_company_id(auth.uid())
);

-- LEAD_ACTIVITIES
DROP POLICY IF EXISTS "Users can view company lead activities" ON public.lead_activities;
CREATE POLICY "Users can view company lead activities" ON public.lead_activities
FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR company_id = get_user_company_id(auth.uid())
);

-- LEAD_ATTACHMENTS
DROP POLICY IF EXISTS "Users can view company attachments" ON public.lead_attachments;
CREATE POLICY "Users can view company attachments" ON public.lead_attachments
FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR company_id = get_user_company_id(auth.uid())
);

-- LEAD_TAGS
DROP POLICY IF EXISTS "Users can view lead tags" ON public.lead_tags;
CREATE POLICY "Users can view lead tags" ON public.lead_tags
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_tags.lead_id
      AND (is_master(auth.uid()) OR l.company_id = get_user_company_id(auth.uid()))
  )
);

-- SCHEDULED_MESSAGES
DROP POLICY IF EXISTS "Users can view company scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can view company scheduled messages" ON public.scheduled_messages
FOR SELECT TO authenticated
USING (
  is_master(auth.uid())
  OR company_id = get_user_company_id(auth.uid())
);