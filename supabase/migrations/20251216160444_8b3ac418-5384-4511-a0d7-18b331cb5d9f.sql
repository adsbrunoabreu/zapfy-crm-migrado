-- Adicionar coluna de responsável na tabela leads
ALTER TABLE public.leads 
ADD COLUMN assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Criar índice para melhor performance em filtros por responsável
CREATE INDEX idx_leads_assigned_to ON public.leads(assigned_to);