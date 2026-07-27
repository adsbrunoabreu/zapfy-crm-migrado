-- Add timezone column to companies table
ALTER TABLE public.companies 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo';

-- Add DELETE policy for scheduled_messages so users can cancel their scheduled messages
CREATE POLICY "Users can delete own scheduled messages" 
ON public.scheduled_messages 
FOR DELETE 
USING (company_id = get_user_company_id(auth.uid()));