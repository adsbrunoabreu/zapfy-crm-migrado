
-- 1) PROFILES
DROP POLICY IF EXISTS "Company admins can view team profiles" ON public.profiles;
DROP POLICY IF EXISTS "Masters can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Company admins can update team profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own safe fields" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY "Company admins can view team profiles" ON public.profiles
FOR SELECT TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
);

CREATE POLICY "Masters can view all profiles" ON public.profiles
FOR SELECT TO authenticated USING (public.is_master(auth.uid()));

CREATE POLICY "Users can update own safe fields" ON public.profiles
FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "Company admins can update team profiles" ON public.profiles
FOR UPDATE TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
)
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
);

-- 2) CHAT-MEDIA: privado
UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

DROP POLICY IF EXISTS "Service role can manage chat media" ON storage.objects;
DROP POLICY IF EXISTS "Company members can view chat media" ON storage.objects;
DROP POLICY IF EXISTS "Masters can view all chat media" ON storage.objects;
DROP POLICY IF EXISTS "Company members can delete own chat media" ON storage.objects;

CREATE POLICY "Company members can view chat media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

CREATE POLICY "Masters can view all chat media"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'chat-media' AND public.is_master(auth.uid()));

CREATE POLICY "Company members can delete own chat media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- 3) REALTIME
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users subscribe to own company topics" ON realtime.messages;

CREATE POLICY "Authenticated users subscribe to own company topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  public.is_master(auth.uid())
  OR realtime.topic() LIKE (
    (SELECT company_id::text FROM public.profiles WHERE id = auth.uid()) || ':%'
  )
  OR realtime.topic() = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
  OR realtime.topic() LIKE 'user:' || auth.uid()::text || '%'
  OR realtime.topic() LIKE auth.uid()::text || '%'
);

-- 4) WHATSAPP TEMPLATES (globais)
DROP POLICY IF EXISTS "Authenticated read whatsapp templates" ON public.whatsapp_templates;
CREATE POLICY "Authenticated read whatsapp templates"
ON public.whatsapp_templates FOR SELECT TO authenticated
USING (is_active = true OR public.is_master(auth.uid()));

-- 5) STORAGE UPDATE policies
DROP POLICY IF EXISTS "Company members update lead attachments" ON storage.objects;
CREATE POLICY "Company members update lead attachments"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'lead-attachments'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'lead-attachments'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Company members update scheduled media" ON storage.objects;
CREATE POLICY "Company members update scheduled media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'scheduled-media'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'scheduled-media'
  AND (storage.foldername(name))[1] = (
    SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
  )
);

-- 6) Revoke EXECUTE em SECURITY DEFINER admin/internal
REVOKE EXECUTE ON FUNCTION public.cancel_subscription(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.renew_subscription(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.get_platform_mrr() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.accept_invite(uuid, uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.check_pending_invite_by_email(text) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.auto_close_inactive_tickets() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pending_supervisor_alerts() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.record_ticket_rating_request(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.is_off_business_hours(uuid) FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.get_attendance_reports(uuid, timestamptz, timestamptz) FROM anon, public;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.sync_user_role_from_profile() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.touch_ticket_on_message() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.log_ticket_assignment_change() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.enqueue_attendance_auto_reply() FROM authenticated, anon, public;
REVOKE EXECUTE ON FUNCTION public.capture_rating_response_from_message() FROM authenticated, anon, public;
