
ALTER TABLE public.medical_insurances
  ADD COLUMN IF NOT EXISTS modality TEXT,
  ADD COLUMN IF NOT EXISTS coverage_scope TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT;

COMMENT ON COLUMN public.medical_insurances.modality IS 'Modalidade ANS: Cooperativa Médica, Medicina de Grupo, Seguradora, Autogestão, Filantropia, Particular';
COMMENT ON COLUMN public.medical_insurances.coverage_scope IS 'Abrangência: Nacional, Regional, Estadual, Grupo Específico';
COMMENT ON COLUMN public.medical_insurances.contact_phone IS 'Telefone de autorização/central de atendimento';
