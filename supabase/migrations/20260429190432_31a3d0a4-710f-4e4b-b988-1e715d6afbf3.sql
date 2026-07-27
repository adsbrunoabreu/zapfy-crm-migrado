-- 1. system_integrations
CREATE TABLE public.system_integrations (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.system_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters can read integrations" ON public.system_integrations
FOR SELECT TO authenticated USING (public.is_master(auth.uid()));
CREATE POLICY "Masters can insert integrations" ON public.system_integrations
FOR INSERT TO authenticated WITH CHECK (public.is_master(auth.uid()));
CREATE POLICY "Masters can update integrations" ON public.system_integrations
FOR UPDATE TO authenticated USING (public.is_master(auth.uid())) WITH CHECK (public.is_master(auth.uid()));

-- 2. email_templates
CREATE TABLE public.email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  slug text NOT NULL,
  name text NOT NULL,
  subject text NOT NULL,
  html_body text NOT NULL,
  text_body text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (company_id, slug)
);
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage email templates" ON public.email_templates
FOR ALL TO authenticated USING (public.is_master(auth.uid())) WITH CHECK (public.is_master(auth.uid()));

CREATE POLICY "Companies view own and global email templates" ON public.email_templates
FOR SELECT TO authenticated
USING (company_id IS NULL OR company_id = public.get_user_company_id(auth.uid()));

-- 3. whatsapp_templates
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage whatsapp templates" ON public.whatsapp_templates
FOR ALL TO authenticated USING (public.is_master(auth.uid())) WITH CHECK (public.is_master(auth.uid()));

-- 4. notification_log
CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  template_slug text,
  recipient text NOT NULL,
  subject text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  payload jsonb,
  company_id uuid,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters view notification log" ON public.notification_log
FOR SELECT TO authenticated USING (public.is_master(auth.uid()));

CREATE INDEX idx_notification_log_created ON public.notification_log(created_at DESC);
CREATE INDEX idx_email_templates_slug ON public.email_templates(slug);

-- updated_at triggers
CREATE TRIGGER trg_system_integrations_updated
  BEFORE UPDATE ON public.system_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_email_templates_updated
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_whatsapp_templates_updated
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seeds: templates de e-mail do sistema (globais)
INSERT INTO public.email_templates (company_id, slug, name, subject, html_body, text_body, variables) VALUES
(NULL, 'welcome', 'Boas-vindas', 'Bem-vindo(a) ao {{platform_name}}!',
'<h1>Olá {{user_name}}!</h1><p>Sua conta foi criada com sucesso na {{company_name}}. Acesse a plataforma para começar.</p>',
'Olá {{user_name}}! Sua conta foi criada com sucesso na {{company_name}}.',
'["user_name","company_name","platform_name"]'::jsonb),

(NULL, 'plan_suspended', 'Plano suspenso', 'Seu acesso foi suspenso',
'<h1>Olá {{user_name}}</h1><p>O plano da empresa <b>{{company_name}}</b> foi suspenso. Para reativar o acesso, entre em contato com o administrador do sistema.</p>',
'Olá {{user_name}}, o plano da empresa {{company_name}} foi suspenso. Entre em contato com o administrador para reativar.',
'["user_name","company_name"]'::jsonb),

(NULL, 'plan_cancelled', 'Plano cancelado', 'Seu plano foi cancelado',
'<h1>Olá {{user_name}}</h1><p>O plano da empresa <b>{{company_name}}</b> foi cancelado. Seus dados ficam preservados. Entre em contato para reativar.</p>',
'Olá {{user_name}}, o plano da empresa {{company_name}} foi cancelado.',
'["user_name","company_name"]'::jsonb),

(NULL, 'plan_reactivated', 'Plano reativado', 'Seu acesso foi restaurado!',
'<h1>Olá {{user_name}}</h1><p>O plano da empresa <b>{{company_name}}</b> foi reativado. Você já pode acessar normalmente.</p>',
'Olá {{user_name}}, o plano da empresa {{company_name}} foi reativado.',
'["user_name","company_name"]'::jsonb),

(NULL, 'reactivation_request', 'Solicitação de reativação', 'Nova solicitação de reativação - {{company_name}}',
'<h2>Nova solicitação de reativação</h2><p><b>Empresa:</b> {{company_name}}</p><p><b>Solicitante:</b> {{requester_name}} ({{requester_email}})</p><p><b>Mensagem:</b> {{message}}</p>',
'Nova solicitação de reativação. Empresa: {{company_name}}. Solicitante: {{requester_name}} ({{requester_email}}). Mensagem: {{message}}',
'["company_name","requester_name","requester_email","message"]'::jsonb);

-- Seeds: templates de WhatsApp do sistema
INSERT INTO public.whatsapp_templates (slug, name, body, variables) VALUES
('welcome', 'Boas-vindas', 'Olá {{user_name}}! 🎉 Sua conta na {{company_name}} foi criada com sucesso. Bem-vindo(a)!', '["user_name","company_name"]'::jsonb),
('plan_suspended', 'Plano suspenso', 'Olá {{user_name}}, o plano da empresa {{company_name}} foi suspenso. Entre em contato com o administrador para reativar.', '["user_name","company_name"]'::jsonb),
('plan_reactivated', 'Plano reativado', 'Boa notícia, {{user_name}}! ✅ O plano da {{company_name}} foi reativado.', '["user_name","company_name"]'::jsonb);

-- Seeds: configs vazias para Resend, Evolution Master e instância interna
INSERT INTO public.system_integrations (key, value) VALUES
('resend', '{"from_email":"","from_name":"","configured":false}'::jsonb),
('evolution_master', '{"webhook_url":"","configured":false}'::jsonb),
('evolution_internal', '{"instance_name":"","phone":"","status":"disconnected"}'::jsonb);