-- Audit log de visualização de conversas/mensagens
CREATE TABLE IF NOT EXISTS public.conversation_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  user_id uuid NOT NULL,
  conversation_id uuid,
  access_type text NOT NULL CHECK (access_type IN ('view_conversation','view_messages','list_conversations')),
  message_count integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cal_company_created ON public.conversation_access_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_user_created ON public.conversation_access_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cal_conv_created ON public.conversation_access_log (conversation_id, created_at DESC);

ALTER TABLE public.conversation_access_log ENABLE ROW LEVEL SECURITY;

-- Admin/Master visualizam logs da própria empresa; Master vê tudo.
DROP POLICY IF EXISTS "audit_select_admin_master" ON public.conversation_access_log;
CREATE POLICY "audit_select_admin_master"
ON public.conversation_access_log
FOR SELECT
TO authenticated
USING (
  public.is_master(auth.uid())
  OR (
    company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'company_admin'::app_role)
  )
);

-- Inserts apenas via RPC (security definer). Bloquear inserts diretos.
DROP POLICY IF EXISTS "audit_no_direct_insert" ON public.conversation_access_log;
CREATE POLICY "audit_no_direct_insert"
ON public.conversation_access_log
FOR INSERT
TO authenticated
WITH CHECK (false);

-- RPC para registrar acesso (resolve company_id do usuário, valida conversa).
CREATE OR REPLACE FUNCTION public.log_conversation_access(
  _access_type text,
  _conversation_id uuid DEFAULT NULL,
  _message_count integer DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _cid uuid;
  _conv_company uuid;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF _access_type NOT IN ('view_conversation','view_messages','list_conversations') THEN
    RAISE EXCEPTION 'invalid access_type: %', _access_type;
  END IF;

  _cid := public.get_user_company_id(_uid);

  IF _conversation_id IS NOT NULL THEN
    SELECT company_id INTO _conv_company
    FROM public.conversations WHERE id = _conversation_id;

    -- Master pode logar qualquer conversa; demais apenas da própria empresa.
    IF _conv_company IS NOT NULL
       AND _conv_company <> _cid
       AND NOT public.is_master(_uid) THEN
      RAISE EXCEPTION 'cross-tenant access blocked';
    END IF;

    IF _conv_company IS NOT NULL THEN
      _cid := _conv_company;
    END IF;
  END IF;

  IF _cid IS NULL THEN
    RAISE EXCEPTION 'no company context';
  END IF;

  INSERT INTO public.conversation_access_log
    (company_id, user_id, conversation_id, access_type, message_count, metadata)
  VALUES
    (_cid, _uid, _conversation_id, _access_type, _message_count, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_conversation_access(text, uuid, integer, jsonb) TO authenticated;