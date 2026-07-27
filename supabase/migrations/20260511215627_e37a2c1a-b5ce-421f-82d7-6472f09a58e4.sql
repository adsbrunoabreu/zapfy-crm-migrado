-- Tabela de itens do roadmap controlada pelo Master
CREATE TABLE IF NOT EXISTS public.roadmap_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'Sparkles',
  status TEXT NOT NULL DEFAULT 'soon' CHECK (status IN ('done','in_progress','soon')),
  addon BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_items_status ON public.roadmap_items(status);
CREATE INDEX IF NOT EXISTS idx_roadmap_items_sort ON public.roadmap_items(sort_order);

ALTER TABLE public.roadmap_items ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ler (a página /roadmap é acessível a todos os papéis)
CREATE POLICY "Authenticated can read roadmap items"
  ON public.roadmap_items FOR SELECT
  TO authenticated
  USING (true);

-- Apenas Master administra
CREATE POLICY "Master manages roadmap items"
  ON public.roadmap_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'master'))
  WITH CHECK (public.has_role(auth.uid(), 'master'));

-- Trigger updated_at
CREATE TRIGGER trg_roadmap_items_updated_at
BEFORE UPDATE ON public.roadmap_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed inicial com os itens hoje hardcoded
INSERT INTO public.roadmap_items (title, description, icon, status, addon, sort_order) VALUES
  ('Agentes de IA',
   'Atendimento automatizado por IA treinada com a base de conhecimento da sua empresa, qualificando leads e respondendo conversas no WhatsApp.',
   'Bot', 'in_progress', true, 10),
  ('Automações',
   'Fluxos automáticos para distribuir leads, enviar follow-ups, mover cards no pipeline e disparar notificações sem intervenção manual.',
   'Sparkles', 'in_progress', true, 20),
  ('Integração com lojas virtuais',
   'Conecte sua loja Shopify, WooCommerce e outras plataformas para que o agente de IA recomende e venda produtos diretamente no WhatsApp.',
   'ShoppingBag', 'in_progress', true, 30),
  ('Integração com Google Calendar',
   'Sincronize agendamentos do CRM com sua agenda do Google em tempo real, evitando conflitos de horários e confirmando compromissos automaticamente.',
   'Calendar', 'soon', false, 40),
  ('API completa',
   'API REST documentada para integrar o zapfy a qualquer sistema externo: criar leads, disparar mensagens, consultar pipelines e muito mais.',
   'Code2', 'soon', false, 50),
  ('Fluxos n8n',
   'Conector nativo para o n8n, permitindo orquestrar workflows complexos com centenas de outros aplicativos a partir de eventos do zapfy.',
   'Workflow', 'soon', false, 60);