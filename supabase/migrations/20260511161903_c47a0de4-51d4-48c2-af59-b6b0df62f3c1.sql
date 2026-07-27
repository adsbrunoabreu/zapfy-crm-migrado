CREATE TABLE IF NOT EXISTS public.whatsapp_lid_map (
  company_id uuid NOT NULL,
  lid text NOT NULL,
  phone_jid text NOT NULL,
  instance_name text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, lid)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_lid_map_company_phone
  ON public.whatsapp_lid_map (company_id, phone_jid);

ALTER TABLE public.whatsapp_lid_map ENABLE ROW LEVEL SECURITY;

-- Sem policies = nenhum acesso via anon/authenticated. Service role bypassa RLS.
