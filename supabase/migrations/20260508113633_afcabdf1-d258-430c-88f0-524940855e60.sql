CREATE POLICY "Admins can delete conversations"
ON public.conversations
FOR DELETE
TO authenticated
USING (
  public.is_company_admin(auth.uid())
  AND company_id = public.get_user_company_id(auth.uid())
);