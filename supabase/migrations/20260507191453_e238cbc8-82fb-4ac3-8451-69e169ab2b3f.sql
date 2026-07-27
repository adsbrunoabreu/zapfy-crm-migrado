
-- 1. Tabela de vínculo
CREATE TABLE public.instance_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instance_id, user_id)
);

CREATE INDEX idx_instance_agents_user ON public.instance_agents(company_id, user_id);
CREATE INDEX idx_instance_agents_instance ON public.instance_agents(company_id, instance_id);

ALTER TABLE public.instance_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view company instance agents"
ON public.instance_agents FOR SELECT
USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Admins manage instance agents"
ON public.instance_agents FOR ALL
USING (is_master(auth.uid()) OR (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())))
WITH CHECK (is_master(auth.uid()) OR (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())));

-- 2. Função helper: acesso à instância
CREATE OR REPLACE FUNCTION public.user_has_instance_access(_user_id uuid, _instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Sem instância vinculada (mensagens órfãs/legadas) → permite
    _instance_id IS NULL
    -- Master e admin têm acesso total
    OR is_master(_user_id)
    OR is_company_admin(_user_id)
    -- Usuário explicitamente vinculado
    OR EXISTS (
      SELECT 1 FROM public.instance_agents ia
      WHERE ia.instance_id = _instance_id AND ia.user_id = _user_id
    )
    -- Fallback: instância sem nenhum vínculo é "aberta" para a empresa
    OR (
      EXISTS (
        SELECT 1 FROM public.whatsapp_instances wi
        WHERE wi.id = _instance_id
          AND wi.company_id = get_user_company_id(_user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.instance_agents ia2
        WHERE ia2.instance_id = _instance_id
      )
    );
$$;

-- 3. Atualizar policies de SELECT
DROP POLICY IF EXISTS "Users can view company conversations" ON public.conversations;
CREATE POLICY "Users can view company conversations"
ON public.conversations FOR SELECT
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND user_has_instance_access(auth.uid(), instance_id)
  )
);

DROP POLICY IF EXISTS "Users can view company messages" ON public.chat_messages;
CREATE POLICY "Users can view company messages"
ON public.chat_messages FOR SELECT
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND (
      conversation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
          AND user_has_instance_access(auth.uid(), c.instance_id)
      )
    )
  )
);

-- 4. INSERT de mensagens via app: aplicar guarda na conversa
DROP POLICY IF EXISTS "Service can insert messages" ON public.chat_messages;
CREATE POLICY "Service can insert messages"
ON public.chat_messages FOR INSERT
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
  AND (
    conversation_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND user_has_instance_access(auth.uid(), c.instance_id)
    )
  )
);

-- 5. Tickets: respeitar a fila de canais
DROP POLICY IF EXISTS "Members view company tickets" ON public.attendance_tickets;
CREATE POLICY "Members view company tickets"
ON public.attendance_tickets FOR SELECT
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND (
      conversation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = conversation_id
          AND user_has_instance_access(auth.uid(), c.instance_id)
      )
    )
  )
);
