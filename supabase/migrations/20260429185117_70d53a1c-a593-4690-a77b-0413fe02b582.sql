-- Tabela para armazenar pedidos de reativação de plano
CREATE TABLE public.reactivation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid,
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  company_name text NOT NULL,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  handled_at timestamptz,
  handled_by uuid
);

ALTER TABLE public.reactivation_requests ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode criar (mesmo com plano suspenso/cancelado)
CREATE POLICY "Anyone authenticated can create reactivation requests"
ON public.reactivation_requests
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Apenas Master pode visualizar e gerenciar
CREATE POLICY "Masters can view all reactivation requests"
ON public.reactivation_requests
FOR SELECT
TO authenticated
USING (public.is_master(auth.uid()));

CREATE POLICY "Masters can update reactivation requests"
ON public.reactivation_requests
FOR UPDATE
TO authenticated
USING (public.is_master(auth.uid()))
WITH CHECK (public.is_master(auth.uid()));

CREATE INDEX idx_reactivation_requests_status ON public.reactivation_requests(status, created_at DESC);