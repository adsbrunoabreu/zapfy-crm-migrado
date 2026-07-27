-- Idempotência de disparos de webhook: evita duplicar logs/retries para o mesmo evento
ALTER TABLE public.webhook_logs
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Índice único parcial: mesmo (webhook_id, idempotency_key) não pode repetir
CREATE UNIQUE INDEX IF NOT EXISTS webhook_logs_idem_unique_idx
  ON public.webhook_logs (webhook_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Índice auxiliar p/ lookups rápidos
CREATE INDEX IF NOT EXISTS webhook_logs_idem_lookup_idx
  ON public.webhook_logs (webhook_id, idempotency_key, created_at DESC)
  WHERE idempotency_key IS NOT NULL;