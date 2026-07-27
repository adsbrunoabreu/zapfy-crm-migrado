-- Permite Master criar convites para qualquer empresa (necessário para tela Admin > Usuários > Novo)
CREATE POLICY "Masters can insert invites for any company"
ON public.team_invites
FOR INSERT
TO authenticated
WITH CHECK (public.is_master(auth.uid()));

-- Master também precisa enxergar qualquer convite para listar/copiar link
CREATE POLICY "Masters can view all invites"
ON public.team_invites
FOR SELECT
TO authenticated
USING (public.is_master(auth.uid()));