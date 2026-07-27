ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS insurance_card_number text;
COMMENT ON COLUMN public.leads.insurance_card_number IS 'Número da carteirinha do convênio (alfanumérico)';