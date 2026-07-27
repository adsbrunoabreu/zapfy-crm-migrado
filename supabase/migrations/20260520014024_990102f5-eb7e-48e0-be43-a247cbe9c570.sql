CREATE OR REPLACE FUNCTION public.claim_outbound_message_by_id(_id uuid)
RETURNS SETOF public.outbound_message_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.outbound_message_queue
    WHERE id = _id
      AND status = 'pending'
      AND next_attempt_at <= now()
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE public.outbound_message_queue q
     SET status = 'processing',
         picked_at = now(),
         retry_count = retry_count + 1,
         updated_at = now()
    FROM picked
   WHERE q.id = picked.id
   RETURNING q.*;
END $function$;

REVOKE ALL ON FUNCTION public.claim_outbound_message_by_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_outbound_message_by_id(uuid) TO service_role;