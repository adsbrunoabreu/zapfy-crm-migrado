-- Tabela de consentimentos legais (Termos + Privacidade)
CREATE TABLE IF NOT EXISTS public.user_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'terms_privacy',
  version TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  context TEXT NOT NULL DEFAULT 'signup', -- 'signup' | 'login' | 'oauth'
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user ON public.user_consents(user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_consents_user_kind_version ON public.user_consents(user_id, kind, version);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

-- O próprio usuário pode registrar e ler seus consentimentos.
CREATE POLICY "Users can insert own consents"
  ON public.user_consents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own consents"
  ON public.user_consents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Master pode auditar consentimentos de qualquer usuário.
CREATE POLICY "Master can read all consents"
  ON public.user_consents FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master'));
