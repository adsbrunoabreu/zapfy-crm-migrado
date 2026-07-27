-- Permitir membros da empresa atualizarem o estado da IA da conversa (retomar/pausar manualmente)
CREATE POLICY "Company members update ai_state"
ON public.conversation_ai_state
FOR UPDATE
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid())
  AND is_company_active(company_id)
)
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
);

-- Garantir realtime para conversation_ai_state (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversation_ai_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_ai_state';
  END IF;
END $$;

ALTER TABLE public.conversation_ai_state REPLICA IDENTITY FULL;