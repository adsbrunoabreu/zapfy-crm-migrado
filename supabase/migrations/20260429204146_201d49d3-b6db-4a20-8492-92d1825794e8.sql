-- 1. Tabela de membros do pipeline
CREATE TABLE public.pipeline_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, user_id)
);

CREATE INDEX idx_pipeline_members_pipeline ON public.pipeline_members(pipeline_id);
CREATE INDEX idx_pipeline_members_user ON public.pipeline_members(user_id);

ALTER TABLE public.pipeline_members ENABLE ROW LEVEL SECURITY;

-- 2. Funções helper (SECURITY DEFINER para evitar recursão RLS)
CREATE OR REPLACE FUNCTION public.is_pipeline_member(_user_id uuid, _pipeline_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pipeline_members
    WHERE pipeline_id = _pipeline_id AND user_id = _user_id
  )
$$;

CREATE OR REPLACE FUNCTION public.pipeline_has_members(_pipeline_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pipeline_members WHERE pipeline_id = _pipeline_id
  )
$$;

-- 3. Policies em pipeline_members
CREATE POLICY "Masters manage all pipeline members"
  ON public.pipeline_members FOR ALL
  TO authenticated
  USING (public.is_master(auth.uid()))
  WITH CHECK (public.is_master(auth.uid()));

CREATE POLICY "Company admins manage pipeline members"
  ON public.pipeline_members FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_members.pipeline_id
        AND p.company_id = public.get_user_company_id(auth.uid())
        AND public.is_company_admin(auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_members.pipeline_id
        AND p.company_id = public.get_user_company_id(auth.uid())
        AND public.is_company_admin(auth.uid())
    )
  );

CREATE POLICY "Users can view pipeline members of their company"
  ON public.pipeline_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_members.pipeline_id
        AND (public.is_master(auth.uid()) OR p.company_id = public.get_user_company_id(auth.uid()))
    )
  );

-- 4. Atualizar policy de SELECT em pipelines
DROP POLICY IF EXISTS "Users can view company pipelines" ON public.pipelines;
CREATE POLICY "Users can view company pipelines"
  ON public.pipelines FOR SELECT
  TO authenticated
  USING (
    public.is_master(auth.uid())
    OR (
      company_id = public.get_user_company_id(auth.uid())
      AND (
        public.is_company_admin(auth.uid())
        OR NOT public.pipeline_has_members(id)
        OR public.is_pipeline_member(auth.uid(), id)
      )
    )
  );

-- 5. Atualizar policy de SELECT em pipeline_stages
DROP POLICY IF EXISTS "Users can view company stages" ON public.pipeline_stages;
CREATE POLICY "Users can view company stages"
  ON public.pipeline_stages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.pipelines p
      WHERE p.id = pipeline_stages.pipeline_id
        AND (
          public.is_master(auth.uid())
          OR (
            p.company_id = public.get_user_company_id(auth.uid())
            AND (
              public.is_company_admin(auth.uid())
              OR NOT public.pipeline_has_members(p.id)
              OR public.is_pipeline_member(auth.uid(), p.id)
            )
          )
        )
    )
  );