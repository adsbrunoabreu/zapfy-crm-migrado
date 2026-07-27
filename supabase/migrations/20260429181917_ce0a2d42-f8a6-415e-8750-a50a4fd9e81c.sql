-- Catálogo de planos
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  monthly_price numeric NOT NULL DEFAULT 0,
  yearly_price numeric NOT NULL DEFAULT 0,
  max_users integer,
  max_leads integer,
  max_whatsapp_instances integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Masters manage plans" ON public.subscription_plans
  FOR ALL USING (public.is_master(auth.uid()))
  WITH CHECK (public.is_master(auth.uid()));

CREATE POLICY "Company admins view active plans" ON public.subscription_plans
  FOR SELECT USING (
    public.is_master(auth.uid()) OR
    (is_active = true AND public.is_company_admin(auth.uid()))
  );

CREATE TRIGGER trg_subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Ligação opcional entre subscription e plano
ALTER TABLE public.subscriptions
  ADD COLUMN plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL;

-- Permitir Master deletar assinaturas
CREATE POLICY "Masters delete subscriptions" ON public.subscriptions
  FOR DELETE USING (public.is_master(auth.uid()));

-- Função para cancelar assinatura
CREATE OR REPLACE FUNCTION public.cancel_subscription(_subscription_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.subscriptions
    SET status = 'canceled', canceled_at = now(), updated_at = now()
    WHERE id = _subscription_id;
END;
$$;

-- Função para renovar período (avança 30 dias mensal / 365 anual)
CREATE OR REPLACE FUNCTION public.renew_subscription(_subscription_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cycle text;
BEGIN
  IF NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT billing_cycle INTO _cycle FROM public.subscriptions WHERE id = _subscription_id;

  UPDATE public.subscriptions
    SET current_period_start = now(),
        current_period_end = CASE WHEN _cycle = 'yearly' THEN now() + interval '365 days' ELSE now() + interval '30 days' END,
        status = 'active',
        canceled_at = NULL,
        updated_at = now()
    WHERE id = _subscription_id;
END;
$$;

-- Seed de planos iniciais
INSERT INTO public.subscription_plans (name, description, monthly_price, yearly_price, max_users, max_leads, max_whatsapp_instances, features, display_order)
VALUES
  ('Starter', 'Ideal para times pequenos começando', 99, 990, 3, 1000, 1, '["Pipeline kanban","WhatsApp 1 instância","Até 3 usuários","Suporte por email"]'::jsonb, 1),
  ('Pro', 'Para equipes em crescimento', 299, 2990, 10, 10000, 3, '["Pipelines ilimitados","WhatsApp 3 instâncias","Até 10 usuários","Distribuição automática","Metas e relatórios","Suporte prioritário"]'::jsonb, 2),
  ('Enterprise', 'Para grandes operações', 799, 7990, NULL, NULL, NULL, '["Usuários ilimitados","Leads ilimitados","WhatsApp ilimitado","Webhooks customizados","Suporte dedicado","SLA garantido"]'::jsonb, 3);