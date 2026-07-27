CREATE TABLE IF NOT EXISTS public.attendance_auto_send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  conversation_id uuid,
  queue_id uuid,
  message_kind text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('started','skipped','sent','failed')),
  origin text NOT NULL,
  off_hours_enabled boolean,
  welcome_enabled boolean,
  wait_time_enabled boolean,
  feature_enabled_now boolean,
  is_phantom boolean NOT NULL DEFAULT false,
  skip_reason text,
  http_status int,
  evolution_response jsonb,
  body_preview text,
  instance_name text,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attempts_company_created
  ON public.attendance_auto_send_attempts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_conversation
  ON public.attendance_auto_send_attempts(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attempts_phantom
  ON public.attendance_auto_send_attempts(company_id, is_phantom, created_at DESC)
  WHERE is_phantom = true;
CREATE INDEX IF NOT EXISTS idx_attempts_kind_phase
  ON public.attendance_auto_send_attempts(company_id, message_kind, phase, created_at DESC);

ALTER TABLE public.attendance_auto_send_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master sees all attempts" ON public.attendance_auto_send_attempts;
CREATE POLICY "Master sees all attempts"
  ON public.attendance_auto_send_attempts FOR SELECT TO authenticated
  USING (public.is_master(auth.uid()));

DROP POLICY IF EXISTS "Company admins see own attempts" ON public.attendance_auto_send_attempts;
CREATE POLICY "Company admins see own attempts"
  ON public.attendance_auto_send_attempts FOR SELECT TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'company_admin'::app_role)
      OR public.has_role(auth.uid(), 'master'::app_role)
    )
  );

DROP POLICY IF EXISTS "No direct insert attempts" ON public.attendance_auto_send_attempts;
CREATE POLICY "No direct insert attempts"
  ON public.attendance_auto_send_attempts FOR INSERT TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS "No direct update attempts" ON public.attendance_auto_send_attempts;
CREATE POLICY "No direct update attempts"
  ON public.attendance_auto_send_attempts FOR UPDATE TO authenticated
  USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "No direct delete attempts" ON public.attendance_auto_send_attempts;
CREATE POLICY "No direct delete attempts"
  ON public.attendance_auto_send_attempts FOR DELETE TO authenticated
  USING (false);

CREATE OR REPLACE FUNCTION public.detect_phantom_sends(_hours int DEFAULT 24)
RETURNS TABLE (
  attempt_id uuid,
  company_id uuid,
  conversation_id uuid,
  message_kind text,
  phase text,
  origin text,
  feature_enabled_now boolean,
  skip_reason text,
  body_preview text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, company_id, conversation_id, message_kind, phase, origin,
         feature_enabled_now, skip_reason, body_preview, created_at
    FROM public.attendance_auto_send_attempts
   WHERE is_phantom = true
     AND created_at >= now() - make_interval(hours => _hours)
     AND (
       public.is_master(auth.uid())
       OR company_id = public.get_user_company_id(auth.uid())
     )
   ORDER BY created_at DESC
   LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.notify_attempt_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _supabase_url text;
  _service_key text;
BEGIN
  BEGIN
    _supabase_url := coalesce(current_setting('app.supabase_url', true), current_setting('app.settings.supabase_url', true));
    _service_key := coalesce(current_setting('app.service_role_key', true), current_setting('app.settings.service_role_key', true));
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;

  IF _supabase_url IS NULL OR _service_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.phase IN ('sent','skipped','failed') THEN
    BEGIN
      PERFORM net.http_post(
        url := _supabase_url || '/functions/v1/dispatch-webhooks',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'Authorization', 'Bearer ' || _service_key
        ),
        body := jsonb_build_object(
          'company_id', NEW.company_id,
          'event', 'attendance.auto_message.attempt',
          'payload', jsonb_build_object(
            'attempt_id', NEW.id,
            'conversation_id', NEW.conversation_id,
            'message_kind', NEW.message_kind,
            'phase', NEW.phase,
            'origin', NEW.origin,
            'is_phantom', NEW.is_phantom,
            'feature_enabled_now', NEW.feature_enabled_now,
            'skip_reason', NEW.skip_reason,
            'http_status', NEW.http_status,
            'body_preview', NEW.body_preview,
            'created_at', NEW.created_at
          )
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_attempt_webhook ON public.attendance_auto_send_attempts;
CREATE TRIGGER trg_notify_attempt_webhook
AFTER INSERT ON public.attendance_auto_send_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_attempt_webhook();