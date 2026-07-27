-- Restringe a visibilidade de conversas e mensagens para usuários comuns:
-- só veem conversas atribuídas a eles (via lead.assigned_to) E em instâncias
-- que estão habilitados. Master e admin continuam vendo tudo da empresa.
-- Conversas sem lead vinculado permanecem visíveis (atendimento inicial/triagem).

CREATE OR REPLACE FUNCTION public.user_can_view_conversation(
  _user_id uuid,
  _company_id uuid,
  _instance_id uuid,
  _lead_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Master vê tudo
    is_master(_user_id)
    OR (
      -- Tem que ser da mesma empresa
      _company_id = get_user_company_id(_user_id)
      AND (
        -- Admin da empresa vê tudo
        is_company_admin(_user_id)
        OR (
          -- Usuário comum: precisa ter acesso à instância
          user_has_instance_access(_user_id, _instance_id)
          AND (
            -- E ou a conversa não tem lead (triagem) ou o lead é dele
            _lead_id IS NULL
            OR EXISTS (
              SELECT 1 FROM public.leads l
              WHERE l.id = _lead_id AND l.assigned_to = _user_id
            )
          )
        )
      )
    );
$$;

-- Conversations: substitui policy de SELECT
DROP POLICY IF EXISTS "Users can view company conversations" ON public.conversations;

CREATE POLICY "Users can view assigned conversations"
ON public.conversations
FOR SELECT
TO authenticated
USING (
  public.user_can_view_conversation(auth.uid(), company_id, instance_id, lead_id)
);

-- Chat messages: substitui policy de SELECT para usar a mesma regra via conversation
DROP POLICY IF EXISTS "Users can view company messages" ON public.chat_messages;

CREATE POLICY "Users can view assigned messages"
ON public.chat_messages
FOR SELECT
TO authenticated
USING (
  is_master(auth.uid())
  OR (
    company_id = get_user_company_id(auth.uid())
    AND (
      conversation_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = chat_messages.conversation_id
          AND public.user_can_view_conversation(
            auth.uid(), c.company_id, c.instance_id, c.lead_id
          )
      )
    )
  )
);