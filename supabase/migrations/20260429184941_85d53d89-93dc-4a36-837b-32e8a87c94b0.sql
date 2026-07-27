
-- Função auxiliar: a empresa do usuário tem plano ativo? (ativo ou trial)
CREATE OR REPLACE FUNCTION public.is_company_active(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.companies
    WHERE id = _company_id
      AND plan_status IN ('active', 'trial')
  )
$$;

-- ────────────────────────────────────────────────────────────────
-- LEADS
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view company leads" ON public.leads;
CREATE POLICY "Users can view company leads"
ON public.leads
FOR SELECT
TO authenticated
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND (is_company_admin(auth.uid()) OR assigned_to = auth.uid())
    AND is_company_active(company_id)
  )
);

DROP POLICY IF EXISTS "Users can insert company leads" ON public.leads;
CREATE POLICY "Users can insert company leads"
ON public.leads
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

DROP POLICY IF EXISTS "Users can update company leads" ON public.leads;
CREATE POLICY "Users can update company leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND (is_company_admin(auth.uid()) OR assigned_to = auth.uid())
  AND is_company_active(company_id)
)
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

-- ────────────────────────────────────────────────────────────────
-- LEAD_ACTIVITIES
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view company lead activities" ON public.lead_activities;
CREATE POLICY "Users can view company lead activities"
ON public.lead_activities
FOR SELECT
TO authenticated
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
  )
);

DROP POLICY IF EXISTS "Users can insert lead activities" ON public.lead_activities;
CREATE POLICY "Users can insert lead activities"
ON public.lead_activities
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

-- ────────────────────────────────────────────────────────────────
-- LEAD_ATTACHMENTS
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view company attachments" ON public.lead_attachments;
CREATE POLICY "Users can view company attachments"
ON public.lead_attachments
FOR SELECT
TO authenticated
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
  )
);

DROP POLICY IF EXISTS "Users can insert attachments" ON public.lead_attachments;
CREATE POLICY "Users can insert attachments"
ON public.lead_attachments
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

DROP POLICY IF EXISTS "Users can delete own company attachments" ON public.lead_attachments;
CREATE POLICY "Users can delete own company attachments"
ON public.lead_attachments
FOR DELETE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

-- ────────────────────────────────────────────────────────────────
-- LEAD_TAGS
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view lead tags" ON public.lead_tags;
CREATE POLICY "Users can view lead tags"
ON public.lead_tags
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_tags.lead_id
      AND (
        is_master(auth.uid())
        OR (
          l.company_id = get_user_company_id(auth.uid())
          AND is_company_active(l.company_id)
        )
      )
  )
);

DROP POLICY IF EXISTS "Users can manage lead tags" ON public.lead_tags;
CREATE POLICY "Users can manage lead tags"
ON public.lead_tags
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_tags.lead_id
      AND l.company_id = get_user_company_id(auth.uid())
      AND is_company_active(l.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = lead_tags.lead_id
      AND l.company_id = get_user_company_id(auth.uid())
      AND is_company_active(l.company_id)
  )
);

-- ────────────────────────────────────────────────────────────────
-- PIPELINES
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view company pipelines" ON public.pipelines;
CREATE POLICY "Users can view company pipelines"
ON public.pipelines
FOR SELECT
TO authenticated
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
  )
);

DROP POLICY IF EXISTS "Company admins can manage pipelines" ON public.pipelines;
CREATE POLICY "Company admins can manage pipelines"
ON public.pipelines
FOR ALL
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_admin(auth.uid())
  AND is_company_active(company_id)
)
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_admin(auth.uid())
  AND is_company_active(company_id)
);

-- ────────────────────────────────────────────────────────────────
-- PIPELINE_STAGES
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view company stages" ON public.pipeline_stages;
CREATE POLICY "Users can view company stages"
ON public.pipeline_stages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_stages.pipeline_id
      AND (
        is_master(auth.uid())
        OR (
          p.company_id = get_user_company_id(auth.uid())
          AND is_company_active(p.company_id)
        )
      )
  )
);

DROP POLICY IF EXISTS "Company admins can manage stages" ON public.pipeline_stages;
CREATE POLICY "Company admins can manage stages"
ON public.pipeline_stages
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_stages.pipeline_id
      AND p.company_id = get_user_company_id(auth.uid())
      AND is_company_admin(auth.uid())
      AND is_company_active(p.company_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pipelines p
    WHERE p.id = pipeline_stages.pipeline_id
      AND p.company_id = get_user_company_id(auth.uid())
      AND is_company_admin(auth.uid())
      AND is_company_active(p.company_id)
  )
);

-- ────────────────────────────────────────────────────────────────
-- CONVERSATIONS
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view company conversations" ON public.conversations;
CREATE POLICY "Users can view company conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
  )
);

DROP POLICY IF EXISTS "Service can insert conversations" ON public.conversations;
CREATE POLICY "Service can insert conversations"
ON public.conversations
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

DROP POLICY IF EXISTS "Service can update conversations" ON public.conversations;
CREATE POLICY "Service can update conversations"
ON public.conversations
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

-- ────────────────────────────────────────────────────────────────
-- CHAT_MESSAGES
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view company messages" ON public.chat_messages;
CREATE POLICY "Users can view company messages"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
  )
);

DROP POLICY IF EXISTS "Service can insert messages" ON public.chat_messages;
CREATE POLICY "Service can insert messages"
ON public.chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

DROP POLICY IF EXISTS "Service can update messages" ON public.chat_messages;
CREATE POLICY "Service can update messages"
ON public.chat_messages
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

-- ────────────────────────────────────────────────────────────────
-- SCHEDULED_MESSAGES
-- ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view company scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can view company scheduled messages"
ON public.scheduled_messages
FOR SELECT
TO authenticated
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND is_company_active(company_id)
  )
);

DROP POLICY IF EXISTS "Users can insert scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can insert scheduled messages"
ON public.scheduled_messages
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

DROP POLICY IF EXISTS "Users can update own company scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can update own company scheduled messages"
ON public.scheduled_messages
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);

DROP POLICY IF EXISTS "Users can delete own company scheduled messages" ON public.scheduled_messages;
CREATE POLICY "Users can delete own company scheduled messages"
ON public.scheduled_messages
FOR DELETE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
);
