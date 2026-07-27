-- Tabela de configurações de Multi Atendimento (1 por empresa)
CREATE TABLE public.attendance_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL UNIQUE,

  business_hours JSONB NOT NULL DEFAULT jsonb_build_object(
    'timezone', 'America/Sao_Paulo',
    'days', jsonb_build_object(
      'mon', jsonb_build_object('enabled', true,  'start', '09:00', 'end', '18:00'),
      'tue', jsonb_build_object('enabled', true,  'start', '09:00', 'end', '18:00'),
      'wed', jsonb_build_object('enabled', true,  'start', '09:00', 'end', '18:00'),
      'thu', jsonb_build_object('enabled', true,  'start', '09:00', 'end', '18:00'),
      'fri', jsonb_build_object('enabled', true,  'start', '09:00', 'end', '18:00'),
      'sat', jsonb_build_object('enabled', false, 'start', '09:00', 'end', '13:00'),
      'sun', jsonb_build_object('enabled', false, 'start', '09:00', 'end', '13:00')
    ),
    'off_hours_message', 'Olá! No momento estamos fora do horário de atendimento. Retornaremos assim que possível.',
    'on_call_mode', jsonb_build_object('enabled', false, 'start', '18:00', 'end', '22:00')
  ),

  holidays JSONB NOT NULL DEFAULT '[]'::jsonb,

  tickets JSONB NOT NULL DEFAULT jsonb_build_object(
    'prefix', 'ATD',
    'next_number', 1,
    'show_channel', true,
    'show_internal_notes', true,
    'assignment_mode', 'manual',
    'priorities', jsonb_build_array(
      jsonb_build_object('name', 'Baixa',   'color', '#10b981', 'enabled', true),
      jsonb_build_object('name', 'Média',   'color', '#3b82f6', 'enabled', true),
      jsonb_build_object('name', 'Alta',    'color', '#f59e0b', 'enabled', true),
      jsonb_build_object('name', 'Urgente', 'color', '#ef4444', 'enabled', true)
    ),
    'categories', jsonb_build_array('Suporte', 'Vendas', 'Financeiro')
  ),

  closing JSONB NOT NULL DEFAULT jsonb_build_object(
    'closing_message', 'Atendimento encerrado. Obrigado pelo contato!',
    'reasons', jsonb_build_array('Resolvido', 'Desistência', 'Sem resposta'),
    'inactivity_minutes', 0,
    'allow_reopen', true,
    'reopen_window_hours', 24,
    'preserve_history', true
  ),

  rating JSONB NOT NULL DEFAULT jsonb_build_object(
    'enabled', false,
    'scale', 'stars',
    'allow_comment', true,
    'response_window_hours', 0,
    'request_message', 'Como você avalia nosso atendimento?',
    'block_multiple', true
  ),

  quick_replies JSONB NOT NULL DEFAULT '[]'::jsonb,

  signature JSONB NOT NULL DEFAULT jsonb_build_object(
    'enabled', false,
    'format', 'bold_name',
    'custom_template', '*{{nome_agente}}*',
    'show_avatar', false
  ),

  general JSONB NOT NULL DEFAULT jsonb_build_object(
    'max_concurrent_per_agent', 5,
    'welcome_message', 'Olá! Em que podemos ajudar?',
    'show_wait_time', false,
    'supervisor_alert_minutes', 0,
    'allow_transfer', true
  ),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_settings_company ON public.attendance_settings(company_id);

ALTER TABLE public.attendance_settings ENABLE ROW LEVEL SECURITY;

-- Apenas company_admin pode ver as configurações da própria empresa
CREATE POLICY "Company admins can view attendance settings"
ON public.attendance_settings
FOR SELECT
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
);

-- Insert apenas pelo admin da própria empresa, com plano ativo
CREATE POLICY "Company admins can insert attendance settings"
ON public.attendance_settings
FOR INSERT
TO authenticated
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
  AND public.is_company_active(company_id)
);

-- Update apenas pelo admin da própria empresa, com plano ativo
CREATE POLICY "Company admins can update attendance settings"
ON public.attendance_settings
FOR UPDATE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
  AND public.is_company_active(company_id)
)
WITH CHECK (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
  AND public.is_company_active(company_id)
);

-- Delete apenas pelo admin da própria empresa
CREATE POLICY "Company admins can delete attendance settings"
ON public.attendance_settings
FOR DELETE
TO authenticated
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.is_company_admin(auth.uid())
);

-- Trigger de updated_at
CREATE TRIGGER update_attendance_settings_updated_at
BEFORE UPDATE ON public.attendance_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();