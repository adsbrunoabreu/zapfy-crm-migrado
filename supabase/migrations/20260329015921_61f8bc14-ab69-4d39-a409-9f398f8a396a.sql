
-- Criar tabela scheduled_messages
CREATE TABLE public.scheduled_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  send_at TIMESTAMP WITH TIME ZONE NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  message_type TEXT NOT NULL DEFAULT 'text',
  media_url TEXT,
  media_caption TEXT,
  media_filename TEXT,
  media_mimetype TEXT
);

-- Índices
CREATE INDEX idx_scheduled_messages_company ON public.scheduled_messages(company_id);
CREATE INDEX idx_scheduled_messages_lead ON public.scheduled_messages(lead_id);
CREATE INDEX idx_scheduled_messages_status_send_at ON public.scheduled_messages(status, send_at) WHERE status = 'pending';

-- Habilitar RLS
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view company scheduled messages"
  ON public.scheduled_messages FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can insert scheduled messages"
  ON public.scheduled_messages FOR INSERT
  TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can update own company scheduled messages"
  ON public.scheduled_messages FOR UPDATE
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "Users can delete own company scheduled messages"
  ON public.scheduled_messages FOR DELETE
  TO authenticated
  USING (company_id = get_user_company_id(auth.uid()));

-- Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_messages;
