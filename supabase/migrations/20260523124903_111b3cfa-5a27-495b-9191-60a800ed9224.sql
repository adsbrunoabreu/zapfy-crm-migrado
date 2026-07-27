-- =========================================================================
-- Fase 1a: infraestrutura da fila de side-effects de chat_messages
-- =========================================================================
-- Cria fila + trigger que enfileira 5 efeitos por mensagem inserida.
-- Os triggers antigos (webhook, link_preview, ai_agent, set_lead_responded,
-- capture_rating) CONTINUAM RODANDO nesta fase — a fila é apenas observada.
-- Worker e DROPs vêm em fases posteriores depois de validação.
-- =========================================================================

-- 1. Tabela da fila
CREATE TABLE IF NOT EXISTS public.chat_message_side_effects_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  effect_type text NOT NULL CHECK (effect_type IN (
    'webhook','link_preview','ai_agent','set_lead_responded','capture_rating'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending','processing','done','failed','dead','skipped'
  )),
  retry_count int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  picked_at timestamptz,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_se_queue_pending
  ON public.chat_message_side_effects_queue (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_chat_se_queue_msg
  ON public.chat_message_side_effects_queue (chat_message_id, effect_type);

CREATE INDEX IF NOT EXISTS idx_chat_se_queue_company_status
  ON public.chat_message_side_effects_queue (company_id, status, created_at DESC);

ALTER TABLE public.chat_message_side_effects_queue ENABLE ROW LEVEL SECURITY;

-- Somente service_role acessa (worker + Master). Sem políticas para usuários.
REVOKE ALL ON public.chat_message_side_effects_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.chat_message_side_effects_queue TO service_role;

-- 2. Trigger function que enfileira side-effects (NÃO dispara nenhum efeito ainda)
CREATE OR REPLACE FUNCTION public.trg_chat_messages_enqueue_side_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Sempre enfileira 5 effect_types por mensagem inserida.
  -- Idempotência fica no worker (checa duplicidade via chat_message_id + effect_type).
  INSERT INTO public.chat_message_side_effects_queue
    (chat_message_id, company_id, conversation_id, effect_type)
  VALUES
    (NEW.id, NEW.company_id, NEW.conversation_id, 'webhook'),
    (NEW.id, NEW.company_id, NEW.conversation_id, 'link_preview'),
    (NEW.id, NEW.company_id, NEW.conversation_id, 'ai_agent'),
    (NEW.id, NEW.company_id, NEW.conversation_id, 'set_lead_responded'),
    (NEW.id, NEW.company_id, NEW.conversation_id, 'capture_rating');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- NUNCA aborta o INSERT da mensagem. Loga e segue.
  RAISE WARNING '[chat_side_effects_enqueue] failed for msg % : %', NEW.id, SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_chat_messages_enqueue_side_effects ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_enqueue_side_effects
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.trg_chat_messages_enqueue_side_effects();

-- 3. RPCs do worker (claim + mark done/failed)
CREATE OR REPLACE FUNCTION public.claim_chat_side_effects(_limit integer DEFAULT 50)
RETURNS SETOF public.chat_message_side_effects_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.chat_message_side_effects_queue
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY next_attempt_at
    FOR UPDATE SKIP LOCKED
    LIMIT _limit
  )
  UPDATE public.chat_message_side_effects_queue q
     SET status = 'processing',
         picked_at = now(),
         retry_count = retry_count + 1,
         updated_at = now()
    FROM picked
   WHERE q.id = picked.id
   RETURNING q.*;
END $$;

REVOKE ALL ON FUNCTION public.claim_chat_side_effects(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_chat_side_effect_done(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.chat_message_side_effects_queue
     SET status = 'done', processed_at = now(), updated_at = now(), error = NULL
   WHERE id = _id;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_side_effect_done(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_chat_side_effect_skipped(_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.chat_message_side_effects_queue
     SET status = 'skipped', processed_at = now(), updated_at = now(), error = _reason
   WHERE id = _id;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_side_effect_skipped(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_chat_side_effect_failed(_id uuid, _error text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_attempts int;
  v_max int;
  v_delay int;
BEGIN
  SELECT retry_count, max_attempts INTO v_attempts, v_max
    FROM public.chat_message_side_effects_queue WHERE id = _id;

  IF v_attempts >= v_max THEN
    UPDATE public.chat_message_side_effects_queue
       SET status = 'dead', error = _error, updated_at = now()
     WHERE id = _id;
    RETURN 'dead';
  END IF;

  v_delay := LEAST(POWER(2, v_attempts)::int * 5, 600);
  UPDATE public.chat_message_side_effects_queue
     SET status = 'pending',
         error = _error,
         next_attempt_at = now() + make_interval(secs => v_delay),
         updated_at = now()
   WHERE id = _id;
  RETURN 'pending';
END $$;

REVOKE ALL ON FUNCTION public.mark_chat_side_effect_failed(uuid, text) FROM PUBLIC, anon, authenticated;

-- 4. View de monitoramento (Master)
CREATE OR REPLACE VIEW public.chat_side_effects_monitor AS
SELECT
  effect_type,
  status,
  COUNT(*)::bigint AS total,
  MIN(created_at) AS oldest,
  MAX(created_at) AS newest
FROM public.chat_message_side_effects_queue
GROUP BY effect_type, status;

REVOKE ALL ON public.chat_side_effects_monitor FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.chat_side_effects_monitor TO service_role;

-- 5. Limpeza: dropar 2 triggers já DISABLED há tempos
DROP TRIGGER IF EXISTS trg_enqueue_auto_reply ON public.chat_messages;
DROP TRIGGER IF EXISTS trg_seq_cancel_on_reply ON public.chat_messages;

-- =========================================================================
-- FIM Fase 1a
-- =========================================================================
-- Estado atual após esta migration:
--   * BEFORE INSERT (síncrono): chat_messages_canonical_jid
--   * AFTER INSERT (síncronos, mantidos): flush_pending_acks, touch_ticket,
--     unarchive_reopen, reopen_conversation, pause_ai_on_human_takeover,
--     webhook, link_preview, ai_agent, set_lead_responded, capture_rating
--     + NOVO: enqueue_side_effects (apenas observa)
--   * BEFORE UPDATE: prevent_status_regression
--
-- Próximo passo (Fase 1b): criar wrappers _for(_msg_id uuid) e edge function
-- chat-messages-side-effects-worker, validar via execução manual.
-- Próximo passo (Fase 2): dropar 5 triggers antigos + ativar cron 30s.
-- =========================================================================