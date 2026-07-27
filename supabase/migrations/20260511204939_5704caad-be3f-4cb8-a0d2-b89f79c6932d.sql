ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS trial_reminder_6h_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_expired_notified_at timestamptz;

INSERT INTO public.email_templates (slug, company_id, name, subject, html_body, text_body, is_active)
VALUES (
  'trial_ending_soon', NULL, 'Trial terminando (6h)',
  '⏰ Seu teste grátis acaba em poucas horas',
  '<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">'
    || '<h1 style="margin:0 0 12px 0;font-size:22px">Olá {{user_name}}, seu trial está acabando</h1>'
    || '<p style="margin:0 0 16px 0;line-height:1.55">O teste grátis de <strong>{{company_name}}</strong> termina em aproximadamente <strong>{{hours_left}}h</strong>. Para não perder o acesso, escolha um plano e ative sua assinatura agora.</p>'
    || '<p style="margin:0 0 24px 0"><a href="{{cta_url}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;display:inline-block">Escolher meu plano</a></p>'
    || '<p style="font-size:12px;color:#64748b;margin:24px 0 0 0">Você pode pagar com cartão ou Pix sem sair da plataforma. Cancele quando quiser.</p>'
  || '</div>',
  'Seu trial em {{company_name}} acaba em ~{{hours_left}}h. Escolha seu plano: {{cta_url}}',
  true
)
ON CONFLICT (company_id, slug) DO NOTHING;

INSERT INTO public.email_templates (slug, company_id, name, subject, html_body, text_body, is_active)
VALUES (
  'trial_expired', NULL, 'Trial expirado',
  'Seu teste grátis terminou — ative sua assinatura',
  '<div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:auto;padding:24px;color:#0f172a">'
    || '<h1 style="margin:0 0 12px 0;font-size:22px">Olá {{user_name}}, seu trial expirou</h1>'
    || '<p style="margin:0 0 16px 0;line-height:1.55">O período de teste de <strong>{{company_name}}</strong> chegou ao fim. Reative o acesso assinando um plano — leva menos de 2 minutos.</p>'
    || '<p style="margin:0 0 24px 0"><a href="{{cta_url}}" style="background:#3b82f6;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;display:inline-block">Assinar agora</a></p>'
  || '</div>',
  'Seu trial em {{company_name}} expirou. Assine: {{cta_url}}',
  true
)
ON CONFLICT (company_id, slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_trial_reminder_targets()
RETURNS TABLE (
  company_id uuid,
  company_name text,
  trial_ends_at timestamptz,
  hours_left numeric,
  needs_6h_reminder boolean,
  needs_expired_reminder boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.name, c.trial_ends_at,
    ROUND(EXTRACT(EPOCH FROM (c.trial_ends_at - now())) / 3600.0, 2),
    (c.trial_ends_at > now()
      AND c.trial_ends_at <= now() + interval '6 hours'
      AND c.trial_reminder_6h_sent_at IS NULL),
    (c.trial_ends_at <= now() AND c.trial_expired_notified_at IS NULL)
  FROM public.companies c
  WHERE c.plan_status = 'trial'
    AND c.trial_ends_at IS NOT NULL
    AND (
      (c.trial_ends_at > now()
        AND c.trial_ends_at <= now() + interval '6 hours'
        AND c.trial_reminder_6h_sent_at IS NULL)
      OR (c.trial_ends_at <= now() AND c.trial_expired_notified_at IS NULL)
    )
$$;

REVOKE ALL ON FUNCTION public.get_trial_reminder_targets() FROM public, anon, authenticated;