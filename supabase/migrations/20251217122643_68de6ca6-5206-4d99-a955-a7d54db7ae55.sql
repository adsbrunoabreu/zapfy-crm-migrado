-- Criar enum para tipos de ação
CREATE TYPE lead_activity_type AS ENUM (
  'lead_created',
  'lead_transferred',
  'field_updated',
  'tag_added',
  'tag_removed',
  'attachment_added',
  'attachment_removed',
  'stage_changed',
  'note_added',
  'message_scheduled',
  'message_sent'
);

-- Criar tabela de atividades
CREATE TABLE lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action_type lead_activity_type NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_lead_activities_lead_id ON lead_activities(lead_id);
CREATE INDEX idx_lead_activities_company_id ON lead_activities(company_id);
CREATE INDEX idx_lead_activities_created_at ON lead_activities(created_at DESC);

-- Habilitar RLS
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view company lead activities"
ON lead_activities FOR SELECT
USING (
  company_id = get_user_company_id(auth.uid()) 
  OR is_master(auth.uid())
);

CREATE POLICY "Users can insert lead activities"
ON lead_activities FOR INSERT
WITH CHECK (
  company_id = get_user_company_id(auth.uid())
);