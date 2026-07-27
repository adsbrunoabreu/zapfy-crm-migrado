-- 1. Purgar itens stale (mais de 6 horas em pending)
UPDATE public.outbound_message_queue
   SET status = 'dead',
       error = 'manual_purge_stale: ' || COALESCE(error, 'unknown'),
       updated_at = now()
 WHERE status = 'pending'
   AND created_at < now() - interval '6 hours';

-- 2. View de monitoramento da fila
CREATE OR REPLACE VIEW public.outbound_queue_monitor AS
SELECT
    status,
    COUNT(*)::bigint AS total,
    MIN(created_at) AS oldest,
    MAX(created_at) AS newest
FROM public.outbound_message_queue
GROUP BY status;

REVOKE ALL ON public.outbound_queue_monitor FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.outbound_queue_monitor TO service_role;

-- 3. Função utilitária de incremento manual (NÃO usar no worker — claim_outbound_messages já incrementa)
CREATE OR REPLACE FUNCTION public.increment_outbound_retry(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.outbound_message_queue
     SET retry_count = retry_count + 1,
         updated_at = now()
   WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_outbound_retry(uuid) FROM PUBLIC, anon, authenticated;