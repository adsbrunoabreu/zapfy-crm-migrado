-- 1) Recalcular unread_count a partir do estado real das mensagens
WITH real_unread AS (
  SELECT m.conversation_id, COUNT(*)::int AS cnt
    FROM public.chat_messages m
   WHERE m.from_me = false
     AND COALESCE(m.status, '') NOT IN ('read', 'played')
   GROUP BY m.conversation_id
)
UPDATE public.conversations c
   SET unread_count = COALESCE(ru.cnt, 0)
  FROM (
    SELECT c2.id,
           COALESCE((SELECT cnt FROM real_unread r WHERE r.conversation_id = c2.id), 0) AS cnt
      FROM public.conversations c2
  ) ru
 WHERE c.id = ru.id
   AND COALESCE(c.unread_count, 0) <> ru.cnt;

-- 2) Sincronizar closed_at da conversa com o ticket mais recente
WITH latest AS (
  SELECT DISTINCT ON (conversation_id)
         conversation_id,
         status,
         closed_at
    FROM public.attendance_tickets
   WHERE conversation_id IS NOT NULL
   ORDER BY conversation_id, created_at DESC
)
UPDATE public.conversations c
   SET closed_at = CASE
     WHEN l.status IN ('closed','awaiting_rating') THEN COALESCE(l.closed_at, c.closed_at, now())
     ELSE NULL
   END
  FROM latest l
 WHERE l.conversation_id = c.id
   AND (
     (l.status IN ('closed','awaiting_rating') AND c.closed_at IS NULL)
     OR (l.status NOT IN ('closed','awaiting_rating') AND c.closed_at IS NOT NULL)
   );

-- 3) Conversas com closed_at mas SEM ticket vinculado: limpar closed_at
--    (sem ticket não há prova de fechamento; melhor mostrar como aberta/aguardando)
UPDATE public.conversations c
   SET closed_at = NULL
 WHERE c.closed_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.attendance_tickets t WHERE t.conversation_id = c.id
   );

-- 4) Endurecer mark_conversation_read: zera contador e mantém atomicidade
CREATE OR REPLACE FUNCTION public.mark_conversation_read(_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company_id uuid;
  _instance_id uuid;
  _lead_id uuid;
BEGIN
  SELECT company_id, instance_id, lead_id
    INTO _company_id, _instance_id, _lead_id
    FROM public.conversations
   WHERE id = _conversation_id;

  IF _company_id IS NULL THEN RETURN; END IF;

  IF NOT (
    public.is_master(auth.uid())
    OR public.user_can_view_conversation(auth.uid(), _company_id, _instance_id, _lead_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Marca recebidas como lidas
  UPDATE public.chat_messages
     SET status = 'read'
   WHERE conversation_id = _conversation_id
     AND from_me = false
     AND COALESCE(status, '') NOT IN ('read', 'played');

  -- Recalcula a partir do estado real (não confia em contador acumulado)
  UPDATE public.conversations c
     SET unread_count = (
       SELECT COUNT(*)::int FROM public.chat_messages m
        WHERE m.conversation_id = c.id
          AND m.from_me = false
          AND COALESCE(m.status,'') NOT IN ('read','played')
     )
   WHERE c.id = _conversation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated, service_role;