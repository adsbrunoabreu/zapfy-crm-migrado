-- 1) View enriquecida de leads
CREATE OR REPLACE VIEW public.leads_enriched AS
SELECT
  l.id,
  l.numeric_id,
  l.name,
  l.phone,
  l.email,
  l.status,
  l.value,
  l.source,
  l.created_at,
  l.updated_at,
  p.id   AS pipeline_id,
  p.name AS pipeline_name,
  s.id   AS stage_id,
  s.name AS stage_name,
  u.id   AS assigned_to_id,
  COALESCE(u.raw_user_meta_data->>'full_name', pr.full_name) AS assigned_to_name,
  u.email AS assigned_to_email,
  co.id   AS company_id,
  co.name AS company_name
FROM public.leads l
LEFT JOIN public.pipelines       p  ON p.id  = l.pipeline_id
LEFT JOIN public.pipeline_stages s  ON s.id  = l.stage_id
LEFT JOIN auth.users             u  ON u.id  = l.assigned_to
LEFT JOIN public.profiles        pr ON pr.id = l.assigned_to
LEFT JOIN public.companies       co ON co.id = l.company_id;

-- View herda RLS pelas tabelas base; restringimos visibilidade direta da view
REVOKE ALL ON public.leads_enriched FROM PUBLIC, anon, authenticated;

-- 2) Seed da URL global em system_integrations (apenas se ainda não existir)
INSERT INTO public.system_integrations (key, value, updated_at)
VALUES (
  'n8n_global_webhook',
  jsonb_build_object(
    'enabled', true,
    'url', 'https://n8n.nextads.com.br/webhook/ea8fb091-368b-4a9c-8f03-caedbb752c85'
  ),
  now()
)
ON CONFLICT (key) DO NOTHING;

-- 3) Função de disparo do webhook global do n8n
CREATE OR REPLACE FUNCTION public.notify_n8n_lead_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _enriched RECORD;
  _payload  JSONB;
  _config   JSONB;
  _url      TEXT;
  _enabled  BOOLEAN;
  _event    TEXT;
BEGIN
  -- Lê configuração global (URL + enabled)
  SELECT value INTO _config
  FROM public.system_integrations
  WHERE key = 'n8n_global_webhook'
  LIMIT 1;

  IF _config IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _enabled := COALESCE((_config->>'enabled')::BOOLEAN, false);
  _url     := NULLIF(_config->>'url', '');

  IF NOT _enabled OR _url IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Subevento: insert OU campo alterado
  IF TG_OP = 'INSERT' THEN
    _event := 'lead.created';
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      _event := 'lead.status_changed';
    ELSIF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
      _event := 'lead.stage_changed';
    ELSIF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      _event := 'lead.assigned_changed';
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Buscar dados enriquecidos
  SELECT * INTO _enriched
  FROM public.leads_enriched
  WHERE id = COALESCE(NEW.id, OLD.id);

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  _payload := jsonb_build_object(
    'event',     _event,
    'timestamp', now(),
    'data', jsonb_build_object(
      'operation', TG_OP,
      'lead', jsonb_build_object(
        'id',         _enriched.id,
        'numeric_id', _enriched.numeric_id,
        'name',       _enriched.name,
        'phone',      _enriched.phone,
        'email',      _enriched.email,
        'status',     _enriched.status,
        'value',      _enriched.value,
        'source',     _enriched.source,
        'created_at', _enriched.created_at,
        'updated_at', _enriched.updated_at
      ),
      'pipeline', jsonb_build_object(
        'id',   _enriched.pipeline_id,
        'name', _enriched.pipeline_name
      ),
      'stage', jsonb_build_object(
        'id',   _enriched.stage_id,
        'name', _enriched.stage_name
      ),
      'assigned_to', jsonb_build_object(
        'id',    _enriched.assigned_to_id,
        'name',  _enriched.assigned_to_name,
        'email', _enriched.assigned_to_email
      ),
      'company', jsonb_build_object(
        'id',   _enriched.company_id,
        'name', _enriched.company_name
      )
    )
  );

  PERFORM net.http_post(
    url     := _url,
    body    := _payload,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'User-Agent',   'CredFlow-Webhook/2.0'
    )
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Nunca quebra a transação principal por causa do webhook
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 4) Triggers: INSERT + UPDATE de status / stage_id / assigned_to
DROP TRIGGER IF EXISTS trg_n8n_lead_created ON public.leads;
CREATE TRIGGER trg_n8n_lead_created
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_n8n_lead_webhook();

DROP TRIGGER IF EXISTS trg_n8n_lead_updated ON public.leads;
CREATE TRIGGER trg_n8n_lead_updated
  AFTER UPDATE OF status, stage_id, assigned_to ON public.leads
  FOR EACH ROW
  WHEN (
    OLD.status      IS DISTINCT FROM NEW.status
    OR OLD.stage_id IS DISTINCT FROM NEW.stage_id
    OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to
  )
  EXECUTE FUNCTION public.notify_n8n_lead_webhook();