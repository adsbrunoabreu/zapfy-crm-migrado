
-- ============================================================
-- 1) REVOKE EXECUTE de anon em SECURITY DEFINER sensíveis
-- ============================================================
-- Funções que NÃO devem ser chamadas por visitantes (sem login)

REVOKE EXECUTE ON FUNCTION public.cancel_subscription(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.renew_subscription(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_platform_mrr() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.accept_invite(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.submit_ticket_rating(uuid, numeric, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.record_ticket_rating_request(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.close_attendance_ticket(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.reopen_attendance_ticket(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.transfer_attendance_ticket(uuid, uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_attendance_ticket(uuid, uuid, text, text, text, text, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_attendance_reports(uuid, timestamptz, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_pending_supervisor_alerts() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.auto_close_inactive_tickets() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.check_pending_invite_by_email(text) FROM anon, public;

-- Helpers (has_role, is_master, etc.) — SÃO usadas por RLS, devem ficar com authenticated
-- mas removemos anon como segurança em profundidade
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_master(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_company_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_company_active(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_company_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_pipeline_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.pipeline_has_members(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_off_business_hours(uuid) FROM anon, public;

-- ============================================================
-- 2) attendance_ticket_ratings — bloquear INSERT/UPDATE direto
-- ============================================================
-- Apenas SECURITY DEFINER funcs (record_ticket_rating_request, submit_ticket_rating)
-- podem mutar. RLS já existe só com SELECT — mantemos.
-- (não há policy INSERT/UPDATE = já bloqueado; só explicitamos via revoke)

REVOKE INSERT, UPDATE, DELETE ON public.attendance_ticket_ratings FROM authenticated, anon, public;
GRANT  SELECT ON public.attendance_ticket_ratings TO authenticated;

-- ============================================================
-- 3) attendance_auto_messages — restringir INSERT a service role
-- ============================================================
-- A policy atual permite a qualquer authenticated do mesmo company_id inserir.
-- Isso pode ser abusado (cliente fabrica registro de "envio").
-- Revogamos do authenticated; somente service_role insere via edge function.

DROP POLICY IF EXISTS "System inserts auto messages" ON public.attendance_auto_messages;
-- Sem policy de INSERT = bloqueia authenticated. Service role bypassa RLS.

-- ============================================================
-- 4) webhook_logs — adicionar SELECT scope por company
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='webhook_logs') THEN
    -- garante RLS ligado
    EXECUTE 'ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY';

    DROP POLICY IF EXISTS "Admins view company webhook logs" ON public.webhook_logs;
    CREATE POLICY "Admins view company webhook logs"
      ON public.webhook_logs FOR SELECT
      TO authenticated
      USING (
        public.is_master(auth.uid())
        OR (company_id = public.get_user_company_id(auth.uid()) AND public.is_company_admin(auth.uid()))
      );
  END IF;
END$$;

-- ============================================================
-- 5) Storage policies — apertar uploads/views
-- ============================================================

-- chat-media: INSERT restrito a path começando com company_id do usuário
DROP POLICY IF EXISTS "Users can upload chat media" ON storage.objects;
CREATE POLICY "Users upload chat media in own company folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- scheduled-media: INSERT restrito por company
DROP POLICY IF EXISTS "Users can upload scheduled media" ON storage.objects;
CREATE POLICY "Users upload scheduled media in own company folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'scheduled-media'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- scheduled-media: DELETE também restrito
DROP POLICY IF EXISTS "Users can delete own scheduled media" ON storage.objects;
CREATE POLICY "Users delete scheduled media of own company"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'scheduled-media'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- lead-attachments: SELECT restrito por company (path: {company_id}/...)
DROP POLICY IF EXISTS "Users can view lead attachments" ON storage.objects;
CREATE POLICY "Users view lead attachments of own company"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'lead-attachments'
    AND (
      public.is_master(auth.uid())
      OR (storage.foldername(name))[1] = (
        SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
      )
    )
  );

-- lead-attachments: INSERT restrito por company
DROP POLICY IF EXISTS "Users can upload lead attachments" ON storage.objects;
CREATE POLICY "Users upload lead attachments in own company folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'lead-attachments'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- lead-attachments: DELETE restrito por company
DROP POLICY IF EXISTS "Users can delete lead attachments" ON storage.objects;
CREATE POLICY "Users delete lead attachments of own company"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'lead-attachments'
    AND (storage.foldername(name))[1] = (
      SELECT company_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ============================================================
-- 6) company_status_audit — anon não pode inserir
-- ============================================================
-- Policy atual já restringe a master, mas aplicada a authenticated. OK.
-- Revogamos GRANT de tabela para anon como defesa em profundidade.
REVOKE ALL ON public.company_status_audit FROM anon, public;
GRANT  SELECT, INSERT ON public.company_status_audit TO authenticated;
