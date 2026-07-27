
-- Drop the restrictive INSERT policy
DROP POLICY IF EXISTS "Users can insert own instance binding" ON user_whatsapp_instances;

-- Recreate INSERT policy allowing self-insert OR admin insert for company users
CREATE POLICY "Users can insert instance binding"
ON user_whatsapp_instances
FOR INSERT
WITH CHECK (
  (company_id = get_user_company_id(auth.uid()))
  AND (
    user_id = auth.uid()
    OR is_company_admin(auth.uid())
  )
);
