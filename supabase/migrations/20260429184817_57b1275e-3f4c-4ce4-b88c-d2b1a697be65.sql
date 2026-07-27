
-- Permitir que Masters atualizem qualquer perfil (necessário para atribuir usuários a empresas)
CREATE POLICY "Masters can update all profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.is_master(auth.uid()))
WITH CHECK (public.is_master(auth.uid()));

-- Permitir que Company Admins ATRIBUAM usuários sem empresa à própria empresa
-- (a policy existente só cobria usuários que já estavam na empresa)
CREATE POLICY "Company admins can claim unassigned users"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  company_id IS NULL AND public.is_company_admin(auth.uid())
)
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
);
