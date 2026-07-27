-- Fase A.1: trigger para popular leads.responded_at na primeira mensagem from_me
CREATE OR REPLACE FUNCTION public.set_lead_responded_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _lead_id uuid;
BEGIN
  IF NOT NEW.from_me THEN
    RETURN NEW;
  END IF;

  SELECT lead_id INTO _lead_id
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF _lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.leads
  SET responded_at = COALESCE(NEW.timestamp, NEW.created_at, now())
  WHERE id = _lead_id
    AND responded_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lead_responded_at ON public.chat_messages;
CREATE TRIGGER trg_set_lead_responded_at
AFTER INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.set_lead_responded_at();

-- Backfill historico
UPDATE public.leads l
SET responded_at = sub.first_reply
FROM (
  SELECT c.lead_id, MIN(COALESCE(m.timestamp, m.created_at)) AS first_reply
  FROM public.chat_messages m
  JOIN public.conversations c ON c.id = m.conversation_id
  WHERE m.from_me = true AND c.lead_id IS NOT NULL
  GROUP BY c.lead_id
) sub
WHERE l.id = sub.lead_id AND l.responded_at IS NULL;

-- Fase A.2: trigger para garantir stage_id default em novos leads
CREATE OR REPLACE FUNCTION public.set_default_lead_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pipeline_id uuid;
  _stage_id uuid;
BEGIN
  IF NEW.stage_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Determina pipeline: usa o do lead, senao o default da empresa, senao o primeiro
  IF NEW.pipeline_id IS NOT NULL THEN
    _pipeline_id := NEW.pipeline_id;
  ELSE
    SELECT id INTO _pipeline_id
    FROM public.pipelines
    WHERE company_id = NEW.company_id
    ORDER BY COALESCE(is_default, false) DESC, created_at ASC
    LIMIT 1;
  END IF;

  IF _pipeline_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _stage_id
  FROM public.pipeline_stages
  WHERE pipeline_id = _pipeline_id AND stage_type = 'open'
  ORDER BY position ASC
  LIMIT 1;

  IF _stage_id IS NULL THEN
    SELECT id INTO _stage_id
    FROM public.pipeline_stages
    WHERE pipeline_id = _pipeline_id
    ORDER BY position ASC
    LIMIT 1;
  END IF;

  NEW.pipeline_id := _pipeline_id;
  NEW.stage_id := _stage_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_default_lead_stage ON public.leads;
CREATE TRIGGER trg_set_default_lead_stage
BEFORE INSERT ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.set_default_lead_stage();

-- Backfill leads atuais sem stage
UPDATE public.leads l
SET pipeline_id = COALESCE(l.pipeline_id, p.id),
    stage_id = s.id
FROM public.pipelines p
JOIN LATERAL (
  SELECT id FROM public.pipeline_stages
  WHERE pipeline_id = p.id
  ORDER BY (stage_type = 'open') DESC, position ASC
  LIMIT 1
) s ON true
WHERE l.stage_id IS NULL
  AND p.company_id = l.company_id
  AND p.id = COALESCE(
    l.pipeline_id,
    (SELECT id FROM public.pipelines WHERE company_id = l.company_id
     ORDER BY COALESCE(is_default, false) DESC, created_at ASC LIMIT 1)
  );

-- Fase A.3: indice para acelerar contagem de mensagens
CREATE INDEX IF NOT EXISTS idx_chat_messages_company_fromme_created
  ON public.chat_messages(company_id, from_me, created_at DESC);