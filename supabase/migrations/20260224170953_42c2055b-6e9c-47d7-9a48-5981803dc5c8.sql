
-- Drop the existing unrestricted self-update policy
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create a new policy that prevents users from changing sensitive fields
CREATE POLICY "Users can update own safe fields"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND company_id IS NOT DISTINCT FROM (SELECT company_id FROM public.profiles WHERE id = auth.uid())
    AND email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    AND is_active = (SELECT is_active FROM public.profiles WHERE id = auth.uid())
    AND can_have_whatsapp_instance IS NOT DISTINCT FROM (SELECT can_have_whatsapp_instance FROM public.profiles WHERE id = auth.uid())
  );
