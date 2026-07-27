-- 1) Colunas em whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS coexistence_state jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.whatsapp_instances
  DROP CONSTRAINT IF EXISTS whatsapp_instances_mode_check;
ALTER TABLE public.whatsapp_instances
  ADD CONSTRAINT whatsapp_instances_mode_check
  CHECK (mode IN ('standard', 'coexistence'));

-- 2) Fila de chunks de histórico (Coexistence)
CREATE TABLE IF NOT EXISTS public.coexistence_history_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  phase int NOT NULL DEFAULT 0,
  chunk_index int NOT NULL DEFAULT 0,
  payload jsonb NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coex_chunks_pending
  ON public.coexistence_history_chunks (created_at)
  WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_coex_chunks_instance
  ON public.coexistence_history_chunks (instance_id, phase, chunk_index);

ALTER TABLE public.coexistence_history_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins can view coex chunks" ON public.coexistence_history_chunks;
CREATE POLICY "admins can view coex chunks"
  ON public.coexistence_history_chunks
  FOR SELECT
  TO authenticated
  USING (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_admin(auth.uid())
  );

-- 3) RPC para enfileirar chunk (chamada do webhook-router via service role; mantém SECURITY DEFINER por consistência)
CREATE OR REPLACE FUNCTION public.enqueue_coexistence_history_chunk(
  _company_id uuid,
  _instance_id uuid,
  _phase int,
  _chunk_index int,
  _payload jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  INSERT INTO public.coexistence_history_chunks (company_id, instance_id, phase, chunk_index, payload)
  VALUES (_company_id, _instance_id, COALESCE(_phase, 0), COALESCE(_chunk_index, 0), _payload)
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;

-- 4) webhook_retry_queue: aceitar coexistence_history como kind
DO $$
DECLARE
  _conname text;
BEGIN
  SELECT conname INTO _conname
  FROM pg_constraint
  WHERE conrelid = 'public.webhook_retry_queue'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%kind%';
  IF _conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.webhook_retry_queue DROP CONSTRAINT %I', _conname);
  END IF;
END $$;

ALTER TABLE public.webhook_retry_queue
  ADD CONSTRAINT webhook_retry_queue_kind_check
  CHECK (kind IN ('persist_message', 'status_update', 'download_media', 'coexistence_history'));