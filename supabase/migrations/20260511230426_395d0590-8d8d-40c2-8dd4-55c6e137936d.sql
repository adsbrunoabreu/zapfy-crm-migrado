UPDATE public.subscription_plans
   SET monthly_price = 99, yearly_price = 990,
       max_users = 2, max_leads = 1000, max_whatsapp_instances = 1, max_pipelines = 1,
       description = 'Ideal para times pequenos começando',
       features = '["1 pipeline kanban","WhatsApp 1 instância","Até 2 usuários","Suporte por email"]'::jsonb
 WHERE name ILIKE 'starter';

UPDATE public.subscription_plans
   SET monthly_price = 249, yearly_price = 2490,
       max_users = 10, max_leads = 10000, max_whatsapp_instances = 3, max_pipelines = 5,
       description = 'Para equipes em crescimento',
       features = '["Até 5 pipelines","WhatsApp 3 instâncias","Até 10 usuários","Distribuição automática","Metas e relatórios","Suporte prioritário"]'::jsonb
 WHERE name ILIKE 'pro';

UPDATE public.subscription_plans
   SET name = 'Business',
       monthly_price = 497, yearly_price = 4970,
       max_users = NULL, max_leads = NULL, max_whatsapp_instances = 10, max_pipelines = NULL,
       description = 'Para grandes operações sem limites',
       features = '["Pipelines ilimitados","WhatsApp 10 instâncias","Usuários ilimitados","Leads ilimitados","Webhooks customizados","Suporte dedicado","SLA garantido"]'::jsonb
 WHERE name ILIKE 'enterprise' OR name ILIKE 'business';