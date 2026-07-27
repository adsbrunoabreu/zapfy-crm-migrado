-- Trigger functions: revogar EXECUTE de anon/public.
-- Triggers são chamados pelo Postgres internamente, não pela API.
REVOKE EXECUTE ON FUNCTION public.capture_rating_response_from_message() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_attendance_auto_reply() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_ticket_assignment_change() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_user_role_from_profile() FROM anon, public, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_ticket_on_message() FROM anon, public, authenticated;