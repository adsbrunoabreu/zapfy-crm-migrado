-- FASE 1: Estrutura de Banco de Dados para WhatsApp Individual e Seletor de Instância

-- 1.1 Adicionar campo can_have_whatsapp_instance na tabela profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS can_have_whatsapp_instance BOOLEAN DEFAULT false;

COMMENT ON COLUMN profiles.can_have_whatsapp_instance IS 
'Se true, usuario pode conectar sua propria instancia WhatsApp';

-- 1.2 Adicionar campo owner_user_id na tabela whatsapp_instances
ALTER TABLE whatsapp_instances 
ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_owner ON whatsapp_instances(owner_user_id);

COMMENT ON COLUMN whatsapp_instances.owner_user_id IS 
'Usuario dono da instancia. Se NULL, e instancia da empresa (todos admins veem)';

-- 1.3 Adicionar campo whatsapp_instance_id na tabela leads
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS whatsapp_instance_id UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_whatsapp_instance ON leads(whatsapp_instance_id);

COMMENT ON COLUMN leads.whatsapp_instance_id IS 
'Instancia WhatsApp que atende esse lead';

-- 1.4 Atualizar RLS de whatsapp_instances

-- Dropar politicas antigas
DROP POLICY IF EXISTS "Company admins can insert instances" ON whatsapp_instances;
DROP POLICY IF EXISTS "Company admins can update instances" ON whatsapp_instances;
DROP POLICY IF EXISTS "Company admins can delete instances" ON whatsapp_instances;
DROP POLICY IF EXISTS "Users can view company instances" ON whatsapp_instances;

-- Visualizacao: Admin ve tudo, usuario ve apenas sua propria ou da empresa (sem owner)
CREATE POLICY "View instances policy" ON whatsapp_instances FOR SELECT
USING (
  (company_id = get_user_company_id(auth.uid())) 
  AND (
    is_company_admin(auth.uid()) 
    OR owner_user_id = auth.uid() 
    OR owner_user_id IS NULL
  )
);

-- Insert: Admin pode criar qualquer, usuario so se autorizado e para si mesmo
CREATE POLICY "Insert instances policy" ON whatsapp_instances FOR INSERT
WITH CHECK (
  (company_id = get_user_company_id(auth.uid())) 
  AND (
    is_company_admin(auth.uid()) 
    OR (
      owner_user_id = auth.uid() 
      AND EXISTS (
        SELECT 1 FROM profiles 
        WHERE id = auth.uid() 
        AND can_have_whatsapp_instance = true
      )
    )
  )
);

-- Update: Admin pode atualizar qualquer, usuario so a sua
CREATE POLICY "Update instances policy" ON whatsapp_instances FOR UPDATE
USING (
  (company_id = get_user_company_id(auth.uid())) 
  AND (is_company_admin(auth.uid()) OR owner_user_id = auth.uid())
);

-- Delete: Apenas admin pode deletar
CREATE POLICY "Delete instances policy" ON whatsapp_instances FOR DELETE
USING (
  (company_id = get_user_company_id(auth.uid())) 
  AND is_company_admin(auth.uid())
);

-- 1.5 Atualizar RLS de leads para considerar instancia

-- Dropar politica antiga de SELECT
DROP POLICY IF EXISTS "Users can view company leads" ON leads;

-- Nova politica que considera instancia WhatsApp
CREATE POLICY "Users can view company leads" ON leads FOR SELECT
USING (
  (company_id = get_user_company_id(auth.uid())) 
  AND (
    is_company_admin(auth.uid()) 
    OR assigned_to = auth.uid()
    OR EXISTS (
      SELECT 1 FROM whatsapp_instances wi 
      WHERE wi.id = leads.whatsapp_instance_id 
      AND wi.owner_user_id = auth.uid()
    )
  )
);