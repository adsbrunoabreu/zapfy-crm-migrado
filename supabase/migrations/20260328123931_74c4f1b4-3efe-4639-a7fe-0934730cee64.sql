
-- 1. Drop all policies on whatsapp_instances that reference can_have_whatsapp_instance
DROP POLICY IF EXISTS "Delete instances policy" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Insert instances policy" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "Update instances policy" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "View instances policy" ON public.whatsapp_instances;

-- 2. Drop all policies on user_whatsapp_instances
DROP POLICY IF EXISTS "Users can delete own instance binding" ON public.user_whatsapp_instances;
DROP POLICY IF EXISTS "Users can insert instance binding" ON public.user_whatsapp_instances;
DROP POLICY IF EXISTS "Users can update own instance binding" ON public.user_whatsapp_instances;
DROP POLICY IF EXISTS "Users can view own instance binding" ON public.user_whatsapp_instances;

-- 3. Drop profiles policy that references can_have_whatsapp_instance
DROP POLICY IF EXISTS "Users can update own safe fields" ON public.profiles;

-- 4. Recreate profiles policy without can_have_whatsapp_instance
CREATE POLICY "Users can update own safe fields"
ON public.profiles
FOR UPDATE
TO public
USING (id = auth.uid())
WITH CHECK (
  (id = auth.uid())
  AND (role = (SELECT p.role FROM profiles p WHERE p.id = auth.uid()))
  AND (NOT (company_id IS DISTINCT FROM (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())))
  AND (email = (SELECT p.email FROM profiles p WHERE p.id = auth.uid()))
  AND (is_active = (SELECT p.is_active FROM profiles p WHERE p.id = auth.uid()))
);

-- 5. Drop leads policy that references whatsapp_instances
DROP POLICY IF EXISTS "Users can view company leads" ON public.leads;
CREATE POLICY "Users can view company leads"
ON public.leads
FOR SELECT
TO public
USING (
  (company_id = get_user_company_id(auth.uid()))
  AND (
    is_company_admin(auth.uid())
    OR (assigned_to = auth.uid())
  )
);

-- 6. Drop FK and column from leads
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_whatsapp_instance_id_fkey;
ALTER TABLE public.leads DROP COLUMN IF EXISTS whatsapp_instance_id;

-- 7. Drop can_have_whatsapp_instance from profiles
ALTER TABLE public.profiles DROP COLUMN IF EXISTS can_have_whatsapp_instance;

-- 8. Drop evolution columns from companies
ALTER TABLE public.companies DROP COLUMN IF EXISTS evolution_api_url;
ALTER TABLE public.companies DROP COLUMN IF EXISTS evolution_api_token;

-- 9. Drop FK constraints on user_whatsapp_instances
ALTER TABLE public.user_whatsapp_instances DROP CONSTRAINT IF EXISTS user_whatsapp_instances_whatsapp_instance_id_fkey;
ALTER TABLE public.user_whatsapp_instances DROP CONSTRAINT IF EXISTS user_whatsapp_instances_company_id_fkey;

-- 10. Drop tables
DROP TABLE IF EXISTS public.user_whatsapp_instances;
DROP TABLE IF EXISTS public.whatsapp_instances;

-- 11. Drop enum
DROP TYPE IF EXISTS public.instance_status;

-- 12. Drop webhook trigger on leads
DROP TRIGGER IF EXISTS dispatch_webhook_event ON public.leads;

-- 13. Drop functions related to chat
DROP FUNCTION IF EXISTS public.dispatch_webhook_event();
DROP FUNCTION IF EXISTS public.acquire_conversation_lock(uuid, text, integer);
DROP FUNCTION IF EXISTS public.release_conversation_lock(uuid, text);
DROP FUNCTION IF EXISTS public.insert_message_idempotent(uuid, uuid, text, text, text, text, text, text, text, text, timestamptz, text);
DROP FUNCTION IF EXISTS public.update_message_status_monotonic(text, text);
