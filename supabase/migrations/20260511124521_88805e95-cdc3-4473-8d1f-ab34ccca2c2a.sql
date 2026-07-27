-- Backfill instance_id em conversations a partir de instance_name
UPDATE public.conversations c
SET instance_id = wi.id
FROM public.whatsapp_instances wi
WHERE c.instance_id IS NULL
  AND c.instance_name = wi.instance_name
  AND c.company_id = wi.company_id;

-- Reenfileira mensagens 'dead' por conversation_missing das últimas 24h
UPDATE public.outbound_message_queue
SET status = 'pending',
    retry_count = 0,
    error = NULL,
    next_attempt_at = now()
WHERE status = 'dead'
  AND error = 'conversation_missing'
  AND created_at > now() - interval '24 hours';