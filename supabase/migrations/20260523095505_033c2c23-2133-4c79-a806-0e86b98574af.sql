
-- Missões da equipe: desafios temporários com prazo, métrica e recompensa simbólica.
CREATE TABLE public.team_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  metric TEXT NOT NULL CHECK (metric IN ('leads','value','conversions','responses')),
  target_value NUMERIC NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  assigned_to UUID NULL,
  reward_label TEXT,
  reward_icon TEXT DEFAULT 'trophy',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_team_missions_company ON public.team_missions(company_id, status, period_end DESC);
CREATE INDEX idx_team_missions_assigned ON public.team_missions(assigned_to) WHERE assigned_to IS NOT NULL;

-- Validação por trigger (CHECK não pode usar now()/funções voláteis em escopo amplo).
CREATE OR REPLACE FUNCTION public.team_missions_validate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.period_end < NEW.period_start THEN
    RAISE EXCEPTION 'period_end deve ser >= period_start';
  END IF;
  IF NEW.target_value < 0 THEN
    RAISE EXCEPTION 'target_value não pode ser negativo';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_team_missions_validate
BEFORE INSERT OR UPDATE ON public.team_missions
FOR EACH ROW EXECUTE FUNCTION public.team_missions_validate();

ALTER TABLE public.team_missions ENABLE ROW LEVEL SECURITY;

-- SELECT: membros da empresa (ativa) + master bypass.
CREATE POLICY "team_missions_select"
ON public.team_missions FOR SELECT
USING (
  public.has_role(auth.uid(), 'master'::app_role)
  OR (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_active(company_id)
  )
);

-- INSERT: admin/master da empresa
CREATE POLICY "team_missions_insert"
ON public.team_missions FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'master'::app_role)
  OR (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_active(company_id)
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'master'::app_role)
    )
  )
);

-- UPDATE: admin/master
CREATE POLICY "team_missions_update"
ON public.team_missions FOR UPDATE
USING (
  public.has_role(auth.uid(), 'master'::app_role)
  OR (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'master'::app_role)
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'master'::app_role)
  OR (
    company_id = public.get_user_company_id(auth.uid())
    AND public.is_company_active(company_id)
  )
);

-- DELETE: admin/master
CREATE POLICY "team_missions_delete"
ON public.team_missions FOR DELETE
USING (
  public.has_role(auth.uid(), 'master'::app_role)
  OR (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'master'::app_role)
    )
  )
);
