
-- Configuração de retenção
CREATE TABLE public.log_retention_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL UNIQUE,
  hot_days INTEGER NOT NULL DEFAULT 30,         -- mantém na tabela original
  archive_days INTEGER NOT NULL DEFAULT 90,     -- mantém em archived_logs após mover
  archive_enabled BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_moved INTEGER,
  last_purged INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.log_retention_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retention_master_read" ON public.log_retention_policies
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'master'));
CREATE POLICY "retention_master_write" ON public.log_retention_policies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'master'))
  WITH CHECK (public.has_role(auth.uid(),'master'));

CREATE TRIGGER trg_lrp_updated_at BEFORE UPDATE ON public.log_retention_policies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Arquivo unificado
CREATE TABLE public.archived_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT,
  company_id UUID,
  original_created_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_archived_logs_source ON public.archived_logs(source_table, original_created_at);
CREATE INDEX idx_archived_logs_company ON public.archived_logs(company_id, original_created_at) WHERE company_id IS NOT NULL;

ALTER TABLE public.archived_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "archived_logs_master_read" ON public.archived_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'master'));

-- Índices em created_at para purga rápida nas tabelas-fonte (CONCURRENTLY não suportado em migration; CREATE INDEX padrão)
CREATE INDEX IF NOT EXISTS idx_store_integration_logs_created_at ON public.store_integration_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_log_created_at ON public.notification_log(created_at);
CREATE INDEX IF NOT EXISTS idx_instance_events_created_at ON public.instance_events(created_at);
CREATE INDEX IF NOT EXISTS idx_store_webhook_events_created_at ON public.store_webhook_events(created_at);
CREATE INDEX IF NOT EXISTS idx_store_recommendations_log_created_at ON public.store_recommendations_log(created_at);
CREATE INDEX IF NOT EXISTS idx_tracking_events_created_at ON public.tracking_events(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_agent_history_created_at ON public.ai_agent_history(created_at);
CREATE INDEX IF NOT EXISTS idx_lead_history_created_at ON public.lead_history(created_at);

-- Função de retenção. Por tabela: arquiva (se enabled) e depois purga arquivo antigo.
CREATE OR REPLACE FUNCTION public.run_log_retention()
RETURNS TABLE(table_name TEXT, moved INTEGER, purged INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pol RECORD;
  moved_count INTEGER;
  purged_count INTEGER;
  has_company BOOLEAN;
  sql_archive TEXT;
  sql_delete TEXT;
  sql_purge TEXT;
BEGIN
  FOR pol IN SELECT * FROM public.log_retention_policies WHERE enabled = true LOOP
    moved_count := 0;
    purged_count := 0;

    -- Verifica se a tabela existe e tem company_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND information_schema.tables.table_name = pol.table_name) THEN
      CONTINUE;
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND information_schema.columns.table_name = pol.table_name AND column_name='company_id'
    ) INTO has_company;

    -- Arquivar (move + delete) em CTE para garantir consistência
    IF pol.archive_enabled THEN
      sql_archive := format($f$
        WITH moved AS (
          DELETE FROM public.%I
          WHERE created_at < now() - (%L || ' days')::interval
          RETURNING *
        )
        INSERT INTO public.archived_logs (source_table, source_id, company_id, original_created_at, payload)
        SELECT %L, COALESCE((to_jsonb(m.*)->>'id'), NULL), %s, m.created_at, to_jsonb(m.*)
        FROM moved m
        RETURNING 1
      $f$,
        pol.table_name,
        pol.hot_days::text,
        pol.table_name,
        CASE WHEN has_company THEN '(to_jsonb(m.*)->>''company_id'')::uuid' ELSE 'NULL::uuid' END
      );
      EXECUTE sql_archive;
      GET DIAGNOSTICS moved_count = ROW_COUNT;
    ELSE
      -- Sem arquivamento: delete direto
      sql_delete := format('DELETE FROM public.%I WHERE created_at < now() - (%L || '' days'')::interval',
                          pol.table_name, pol.hot_days::text);
      EXECUTE sql_delete;
      GET DIAGNOSTICS moved_count = ROW_COUNT;
    END IF;

    -- Purga do arquivo
    sql_purge := format(
      'DELETE FROM public.archived_logs WHERE source_table = %L AND original_created_at < now() - (%L || '' days'')::interval',
      pol.table_name, (pol.hot_days + pol.archive_days)::text
    );
    EXECUTE sql_purge;
    GET DIAGNOSTICS purged_count = ROW_COUNT;

    UPDATE public.log_retention_policies
       SET last_run_at = now(), last_moved = moved_count, last_purged = purged_count
     WHERE id = pol.id;

    table_name := pol.table_name;
    moved := moved_count;
    purged := purged_count;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.run_log_retention() FROM PUBLIC, anon, authenticated;

-- Políticas padrão
INSERT INTO public.log_retention_policies (table_name, hot_days, archive_days, archive_enabled) VALUES
  ('store_integration_logs', 30, 60, true),
  ('store_webhook_events',   30, 60, true),
  ('store_recommendations_log', 60, 120, false),
  ('system_logs',            30, 90, true),
  ('webhook_logs',           14, 60, true),
  ('notification_log',       30, 60, false),
  ('instance_events',        14, 30, false),
  ('tracking_events',        90, 180, true),
  ('ai_agent_history',       60, 180, false),
  ('lead_history',           180, 365, false),
  ('appointment_audit',      180, 365, true),
  ('company_status_audit',   365, 730, true)
ON CONFLICT (table_name) DO NOTHING;
