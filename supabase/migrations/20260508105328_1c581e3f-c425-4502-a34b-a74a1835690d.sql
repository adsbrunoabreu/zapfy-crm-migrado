-- 1) Tags em profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_profiles_tags ON public.profiles USING GIN (tags);

-- 2) Tabela de notas internas sobre membros
CREATE TABLE IF NOT EXISTS public.team_member_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL,
  member_id   UUID NOT NULL,
  author_id   UUID NOT NULL,
  content     TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tmn_member ON public.team_member_notes (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tmn_company ON public.team_member_notes (company_id);

ALTER TABLE public.team_member_notes ENABLE ROW LEVEL SECURITY;

-- helper já existente: public.is_master(uuid), get_user_company_id(uuid), has_role(uuid, app_role)

-- SELECT
CREATE POLICY "tmn_select_master"
ON public.team_member_notes FOR SELECT
USING (public.is_master(auth.uid()));

CREATE POLICY "tmn_select_company_admin"
ON public.team_member_notes FOR SELECT
USING (
  company_id = public.get_user_company_id(auth.uid())
  AND public.has_role(auth.uid(), 'company_admin'::app_role)
);

CREATE POLICY "tmn_select_own"
ON public.team_member_notes FOR SELECT
USING (author_id = auth.uid());

-- INSERT
CREATE POLICY "tmn_insert_master"
ON public.team_member_notes FOR INSERT
WITH CHECK (public.is_master(auth.uid()) AND author_id = auth.uid());

CREATE POLICY "tmn_insert_company"
ON public.team_member_notes FOR INSERT
WITH CHECK (
  author_id = auth.uid()
  AND company_id = public.get_user_company_id(auth.uid())
  AND member_id IN (
    SELECT id FROM public.profiles WHERE company_id = public.get_user_company_id(auth.uid())
  )
);

-- UPDATE / DELETE
CREATE POLICY "tmn_update_master"
ON public.team_member_notes FOR UPDATE
USING (public.is_master(auth.uid()))
WITH CHECK (public.is_master(auth.uid()));

CREATE POLICY "tmn_update_admin_or_owner"
ON public.team_member_notes FOR UPDATE
USING (
  author_id = auth.uid()
  OR (
    company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'company_admin'::app_role)
  )
)
WITH CHECK (
  author_id = auth.uid()
  OR (
    company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'company_admin'::app_role)
  )
);

CREATE POLICY "tmn_delete_master"
ON public.team_member_notes FOR DELETE
USING (public.is_master(auth.uid()));

CREATE POLICY "tmn_delete_admin_or_owner"
ON public.team_member_notes FOR DELETE
USING (
  author_id = auth.uid()
  OR (
    company_id = public.get_user_company_id(auth.uid())
    AND public.has_role(auth.uid(), 'company_admin'::app_role)
  )
);

-- updated_at trigger (reusa função padrão se existir)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    EXECUTE $f$
      CREATE TRIGGER trg_tmn_updated_at
      BEFORE UPDATE ON public.team_member_notes
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    $f$;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END$$;
