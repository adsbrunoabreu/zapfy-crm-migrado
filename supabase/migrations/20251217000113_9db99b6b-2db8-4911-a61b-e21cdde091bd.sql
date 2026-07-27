-- Remover a política UPDATE atual
DROP POLICY IF EXISTS "Users can update company leads" ON leads;

-- Criar nova política UPDATE sem especificar TO (usa default = public)
CREATE POLICY "Users can update company leads" 
ON leads FOR UPDATE 
USING (
  company_id = get_user_company_id(auth.uid()) 
  AND (is_company_admin(auth.uid()) OR assigned_to = auth.uid())
)
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
);