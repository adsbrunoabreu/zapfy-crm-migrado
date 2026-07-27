-- Remover a política UPDATE atual
DROP POLICY IF EXISTS "Users can update company leads" ON leads;

-- Criar nova política UPDATE com WITH CHECK explícito
-- USING: verifica se usuário pode modificar a linha atual (deve ser da empresa E atribuída a ele ou ser admin)
-- WITH CHECK: verifica a linha nova - apenas precisa ser da mesma empresa (permite mudar assigned_to)
CREATE POLICY "Users can update company leads" 
ON leads FOR UPDATE 
TO authenticated
USING (
  company_id = get_user_company_id(auth.uid()) 
  AND (is_company_admin(auth.uid()) OR assigned_to = auth.uid())
)
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
);