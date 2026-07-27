-- =========================================================
-- 1. Marcador is_demo em todas as tabelas afetadas
-- =========================================================
ALTER TABLE public.pipelines              ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.pipeline_stages        ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.tags                   ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads                  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.conversations          ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.chat_messages          ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.appointment_professionals ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.appointment_reasons    ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE public.appointments           ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_leads_company_demo
  ON public.leads (company_id) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_conversations_company_demo
  ON public.conversations (company_id) WHERE is_demo = true;
CREATE INDEX IF NOT EXISTS idx_appointments_company_demo
  ON public.appointments (company_id) WHERE is_demo = true;

-- =========================================================
-- 2. seed_company_demo_data
-- =========================================================
CREATE OR REPLACE FUNCTION public.seed_company_demo_data(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id uuid;
  v_stage_novo uuid; v_stage_contato uuid; v_stage_proposta uuid;
  v_stage_negoc uuid; v_stage_fech uuid;
  v_tag_quente uuid; v_tag_frio uuid; v_tag_vip uuid; v_tag_indic uuid;
  v_tag_insta uuid; v_tag_site uuid; v_tag_reativ uuid; v_tag_semret uuid;
  v_pro1 uuid; v_pro2 uuid;
  v_reason1 uuid; v_reason2 uuid; v_reason3 uuid;
  v_lead_ids uuid[] := ARRAY[]::uuid[];
  v_conv_id uuid;
  v_lead_id uuid;
  v_now timestamptz := now();
  v_existing int;
  i int;
BEGIN
  -- Idempotência: se já existir qualquer dado demo, sai
  SELECT count(*) INTO v_existing FROM public.leads WHERE company_id = p_company_id AND is_demo = true;
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_seeded');
  END IF;

  -- ===== Pipeline + Stages =====
  INSERT INTO public.pipelines (company_id, name, description, is_default, is_demo)
  VALUES (p_company_id, 'Pipeline de Vendas (exemplo)', 'Pipeline de demonstração — sinta-se à vontade para editar ou apagar.', false, true)
  RETURNING id INTO v_pipeline_id;

  INSERT INTO public.pipeline_stages (pipeline_id, name, color, position, stage_type, is_demo) VALUES
    (v_pipeline_id, 'Novo',          '#3b82f6', 0, 'open', true) RETURNING id INTO v_stage_novo;
  INSERT INTO public.pipeline_stages (pipeline_id, name, color, position, stage_type, is_demo) VALUES
    (v_pipeline_id, 'Contato feito', '#8b5cf6', 1, 'open', true) RETURNING id INTO v_stage_contato;
  INSERT INTO public.pipeline_stages (pipeline_id, name, color, position, stage_type, is_demo) VALUES
    (v_pipeline_id, 'Proposta',      '#f59e0b', 2, 'open', true) RETURNING id INTO v_stage_proposta;
  INSERT INTO public.pipeline_stages (pipeline_id, name, color, position, stage_type, is_demo) VALUES
    (v_pipeline_id, 'Negociação',    '#ec4899', 3, 'open', true) RETURNING id INTO v_stage_negoc;
  INSERT INTO public.pipeline_stages (pipeline_id, name, color, position, stage_type, is_demo) VALUES
    (v_pipeline_id, 'Fechamento',    '#10b981', 4, 'open', true) RETURNING id INTO v_stage_fech;

  -- ===== Tags =====
  INSERT INTO public.tags (company_id, name, color, is_demo) VALUES (p_company_id, 'Quente',      '#ef4444', true) RETURNING id INTO v_tag_quente;
  INSERT INTO public.tags (company_id, name, color, is_demo) VALUES (p_company_id, 'Frio',        '#3b82f6', true) RETURNING id INTO v_tag_frio;
  INSERT INTO public.tags (company_id, name, color, is_demo) VALUES (p_company_id, 'VIP',         '#f59e0b', true) RETURNING id INTO v_tag_vip;
  INSERT INTO public.tags (company_id, name, color, is_demo) VALUES (p_company_id, 'Indicação',   '#10b981', true) RETURNING id INTO v_tag_indic;
  INSERT INTO public.tags (company_id, name, color, is_demo) VALUES (p_company_id, 'Instagram',   '#ec4899', true) RETURNING id INTO v_tag_insta;
  INSERT INTO public.tags (company_id, name, color, is_demo) VALUES (p_company_id, 'Site',        '#8b5cf6', true) RETURNING id INTO v_tag_site;
  INSERT INTO public.tags (company_id, name, color, is_demo) VALUES (p_company_id, 'Reativação',  '#14b8a6', true) RETURNING id INTO v_tag_reativ;
  INSERT INTO public.tags (company_id, name, color, is_demo) VALUES (p_company_id, 'Sem retorno', '#6b7280', true) RETURNING id INTO v_tag_semret;

  -- ===== Leads (15 itens) =====
  -- Helper inline: cria lead e devolve id
  WITH inserted AS (
    INSERT INTO public.leads (company_id, pipeline_id, stage_id, name, phone, email, value, source, status, notes, is_demo, created_at)
    VALUES
      (p_company_id, v_pipeline_id, v_stage_novo,     'Ana Beatriz Lima',      '+5511988880001', 'ana.lima@exemplo.com',     1200.00, 'Instagram',  'new',         'Veio pelo anúncio do Instagram. Pediu mais informações sobre planos.', true, v_now - interval '2 hours'),
      (p_company_id, v_pipeline_id, v_stage_novo,     'Carlos Eduardo Souza',  '+5511988880002', 'carlos.souza@exemplo.com',  2500.00, 'Site',       'new',         'Preencheu formulário do site, quer agendar uma demo.',                  true, v_now - interval '5 hours'),
      (p_company_id, v_pipeline_id, v_stage_novo,     'Mariana Oliveira',      '+5511988880003', 'mariana.o@exemplo.com',      900.00, 'Indicação',  'new',         'Indicada pela Empresa XYZ.',                                            true, v_now - interval '1 day'),
      (p_company_id, v_pipeline_id, v_stage_contato,  'Pedro Henrique Alves',  '+5511988880004', 'pedro.alves@exemplo.com',   3200.00, 'Instagram',  'contacted',   'Conversamos por WhatsApp, vai pensar e retornar amanhã.',               true, v_now - interval '2 days'),
      (p_company_id, v_pipeline_id, v_stage_contato,  'Juliana Ferreira',      '+5511988880005', 'juliana.f@exemplo.com',     1800.00, 'Site',       'contacted',   'Pediu proposta detalhada por e-mail.',                                  true, v_now - interval '3 days'),
      (p_company_id, v_pipeline_id, v_stage_contato,  'Rafael Gomes',          '+5511988880006', 'rafael.g@exemplo.com',      4500.00, 'Indicação',  'contacted',   'Cliente recorrente da concorrência, está reavaliando.',                 true, v_now - interval '4 days'),
      (p_company_id, v_pipeline_id, v_stage_proposta, 'Camila Rodrigues',      '+5511988880007', 'camila.r@exemplo.com',      5200.00, 'Site',       'qualified',   'Proposta enviada, aguardando feedback do financeiro.',                  true, v_now - interval '5 days'),
      (p_company_id, v_pipeline_id, v_stage_proposta, 'Lucas Martins',         '+5511988880008', 'lucas.m@exemplo.com',       3700.00, 'Instagram',  'qualified',   'Aprovou o escopo, ajustando valores.',                                  true, v_now - interval '6 days'),
      (p_company_id, v_pipeline_id, v_stage_negoc,    'Fernanda Costa',        '+5511988880009', 'fernanda.c@exemplo.com',    7800.00, 'Indicação',  'qualified',   'Pediu desconto de 10%, em análise.',                                    true, v_now - interval '7 days'),
      (p_company_id, v_pipeline_id, v_stage_negoc,    'Bruno Almeida',         '+5511988880010', 'bruno.a@exemplo.com',       4200.00, 'Site',       'qualified',   'Negociando prazo de pagamento (30/60/90).',                              true, v_now - interval '8 days'),
      (p_company_id, v_pipeline_id, v_stage_negoc,    'Tatiane Ribeiro',       '+5511988880011', 'tatiane.r@exemplo.com',     2900.00, 'Instagram',  'qualified',   'Vai assinar na próxima semana, esperando aprovação interna.',           true, v_now - interval '9 days'),
      (p_company_id, v_pipeline_id, v_stage_fech,     'Gustavo Pereira',       '+5511988880012', 'gustavo.p@exemplo.com',     6100.00, 'Site',       'qualified',   'Contrato em assinatura — fechado!',                                     true, v_now - interval '10 days'),
      (p_company_id, v_pipeline_id, v_stage_fech,     'Larissa Carvalho',      '+5511988880013', 'larissa.c@exemplo.com',     3300.00, 'Indicação',  'qualified',   'Pagamento confirmado, iniciando onboarding.',                           true, v_now - interval '12 days'),
      (p_company_id, v_pipeline_id, v_stage_novo,     'Diego Nunes',           '+5511988880014', 'diego.n@exemplo.com',       1500.00, 'Site',       'new',         'Curioso sobre integração com WhatsApp.',                                true, v_now - interval '6 hours'),
      (p_company_id, v_pipeline_id, v_stage_contato,  'Patrícia Mendes',       '+5511988880015', 'patricia.m@exemplo.com',    2200.00, 'Instagram',  'contacted',   'Enviei material complementar, aguardando retorno.',                     true, v_now - interval '36 hours')
    RETURNING id
  )
  SELECT array_agg(id) INTO v_lead_ids FROM inserted;

  -- ===== Lead tags =====
  INSERT INTO public.lead_tags (lead_id, tag_id) VALUES
    (v_lead_ids[1],  v_tag_insta),  (v_lead_ids[1],  v_tag_quente),
    (v_lead_ids[2],  v_tag_site),
    (v_lead_ids[3],  v_tag_indic),  (v_lead_ids[3],  v_tag_frio),
    (v_lead_ids[4],  v_tag_insta),  (v_lead_ids[4],  v_tag_quente),
    (v_lead_ids[5],  v_tag_site),
    (v_lead_ids[6],  v_tag_indic),  (v_lead_ids[6],  v_tag_vip),
    (v_lead_ids[7],  v_tag_site),   (v_lead_ids[7],  v_tag_quente),
    (v_lead_ids[8],  v_tag_insta),
    (v_lead_ids[9],  v_tag_indic),  (v_lead_ids[9],  v_tag_vip),
    (v_lead_ids[10], v_tag_site),
    (v_lead_ids[11], v_tag_insta),  (v_lead_ids[11], v_tag_reativ),
    (v_lead_ids[12], v_tag_site),   (v_lead_ids[12], v_tag_vip),
    (v_lead_ids[13], v_tag_indic),
    (v_lead_ids[14], v_tag_site),   (v_lead_ids[14], v_tag_frio),
    (v_lead_ids[15], v_tag_insta),  (v_lead_ids[15], v_tag_semret);

  -- ===== Profissionais (agendamentos) =====
  INSERT INTO public.appointment_professionals
    (company_id, name, email, phone, specialty, color, is_active, work_start_time, work_end_time, work_days, is_demo)
  VALUES
    (p_company_id, 'Dra. Camila Souza', 'camila.souza@exemplo.com', '+5511988887001', 'Atendimento',  '#ec4899', true, '09:00', '18:00', '{1,2,3,4,5}', true)
  RETURNING id INTO v_pro1;
  INSERT INTO public.appointment_professionals
    (company_id, name, email, phone, specialty, color, is_active, work_start_time, work_end_time, work_days, is_demo)
  VALUES
    (p_company_id, 'Dr. Lucas Pereira', 'lucas.pereira@exemplo.com', '+5511988887002', 'Procedimentos','#3b82f6', true, '08:00', '17:00', '{1,2,3,4,5,6}', true)
  RETURNING id INTO v_pro2;

  -- ===== Motivos =====
  INSERT INTO public.appointment_reasons (company_id, name, color, default_duration_minutes, is_active, is_demo)
  VALUES (p_company_id, 'Consulta inicial', '#10b981', 60, true, true) RETURNING id INTO v_reason1;
  INSERT INTO public.appointment_reasons (company_id, name, color, default_duration_minutes, is_active, is_demo)
  VALUES (p_company_id, 'Retorno',          '#3b82f6', 30, true, true) RETURNING id INTO v_reason2;
  INSERT INTO public.appointment_reasons (company_id, name, color, default_duration_minutes, is_active, is_demo)
  VALUES (p_company_id, 'Procedimento',     '#f59e0b', 90, true, true) RETURNING id INTO v_reason3;

  -- ===== Agendamentos (10 itens, mistos) =====
  INSERT INTO public.appointments (company_id, professional_id, reason_id, lead_id, title, notes, start_at, end_at, status, is_demo) VALUES
    (p_company_id, v_pro1, v_reason1, v_lead_ids[1],  'Consulta inicial — Ana',          'Primeiro atendimento.',          date_trunc('hour', v_now) + interval '1 day 10 hours',  date_trunc('hour', v_now) + interval '1 day 11 hours',  'scheduled', true),
    (p_company_id, v_pro1, v_reason2, v_lead_ids[4],  'Retorno — Pedro',                  'Acompanhamento mensal.',         date_trunc('hour', v_now) + interval '2 day 14 hours',  date_trunc('hour', v_now) + interval '2 day 14 hours 30 minutes', 'scheduled', true),
    (p_company_id, v_pro2, v_reason3, v_lead_ids[7],  'Procedimento — Camila',            'Confirmar exames anteriores.',   date_trunc('hour', v_now) + interval '3 day 9 hours',   date_trunc('hour', v_now) + interval '3 day 10 hours 30 minutes', 'scheduled', true),
    (p_company_id, v_pro1, v_reason1, v_lead_ids[12], 'Consulta inicial — Gustavo',       'Lead pronto para fechar.',       date_trunc('hour', v_now) + interval '4 day 16 hours',  date_trunc('hour', v_now) + interval '4 day 17 hours',  'scheduled', true),
    (p_company_id, v_pro2, v_reason2, v_lead_ids[5],  'Retorno — Juliana',                'Revisão de proposta.',           date_trunc('hour', v_now) + interval '5 day 11 hours',  date_trunc('hour', v_now) + interval '5 day 11 hours 30 minutes', 'scheduled', true),
    (p_company_id, v_pro1, v_reason1, v_lead_ids[14], 'Consulta inicial — Diego',         'Demo do produto.',               date_trunc('hour', v_now) + interval '7 day 15 hours',  date_trunc('hour', v_now) + interval '7 day 16 hours',  'scheduled', true),
    (p_company_id, v_pro2, v_reason3, v_lead_ids[9],  'Procedimento — Fernanda',          'Atendimento VIP.',               date_trunc('hour', v_now) + interval '10 day 10 hours', date_trunc('hour', v_now) + interval '10 day 11 hours 30 minutes','scheduled', true),
    (p_company_id, v_pro1, v_reason2, v_lead_ids[15], 'Retorno — Patrícia',               'Tentativa de reativação.',       date_trunc('hour', v_now) + interval '12 day 13 hours', date_trunc('hour', v_now) + interval '12 day 13 hours 30 minutes','scheduled', true),
    (p_company_id, v_pro1, v_reason1, v_lead_ids[3],  'Consulta inicial — Mariana',       'Atendimento já realizado.',      date_trunc('hour', v_now) - interval '3 day' + interval '10 hours', date_trunc('hour', v_now) - interval '3 day' + interval '11 hours', 'completed', true),
    (p_company_id, v_pro2, v_reason2, v_lead_ids[6],  'Retorno — Rafael',                 'Realizado na semana passada.',   date_trunc('hour', v_now) - interval '6 day' + interval '14 hours', date_trunc('hour', v_now) - interval '6 day' + interval '14 hours 30 minutes', 'completed', true);

  -- ===== Conversas + mensagens (5 conversas) =====
  FOR i IN 1..5 LOOP
    v_lead_id := v_lead_ids[i];
    INSERT INTO public.conversations
      (company_id, instance_name, remote_jid, phone, contact_name, lead_id, last_message_text, last_message_at, unread_count, provider, is_demo)
    SELECT
      p_company_id,
      'demo',
      regexp_replace(l.phone, '\D', '', 'g') || '@s.whatsapp.net',
      l.phone,
      l.name,
      l.id,
      'Perfeito, fico no aguardo!',
      v_now - (i || ' hours')::interval,
      CASE WHEN i % 2 = 0 THEN 0 ELSE 1 END,
      'demo',
      true
    FROM public.leads l WHERE l.id = v_lead_id
    RETURNING id INTO v_conv_id;

    -- 8 mensagens alternadas
    INSERT INTO public.chat_messages
      (company_id, conversation_id, remote_jid, message_id, from_me, message_type, content, status, sender_name, "timestamp", provider, is_demo)
    SELECT
      p_company_id,
      v_conv_id,
      regexp_replace(l.phone, '\D', '', 'g') || '@s.whatsapp.net',
      'demo-' || v_conv_id::text || '-' || g,
      CASE WHEN g % 2 = 0 THEN true ELSE false END,
      'text',
      CASE g
        WHEN 1 THEN 'Olá! Vi o anúncio de vocês e queria saber mais.'
        WHEN 2 THEN 'Oi ' || split_part(l.name,' ',1) || ', tudo bem? Claro, posso te explicar 😊'
        WHEN 3 THEN 'Quanto custa o plano básico?'
        WHEN 4 THEN 'Temos planos a partir de R$ 197/mês. Posso te enviar a tabela completa?'
        WHEN 5 THEN 'Pode sim, por favor!'
        WHEN 6 THEN 'Acabei de enviar por e-mail. Me avise se chegar 👍'
        WHEN 7 THEN 'Chegou sim, vou analisar e te retorno ainda hoje.'
        WHEN 8 THEN 'Perfeito, fico no aguardo!'
      END,
      CASE WHEN g % 2 = 0 THEN 'read' ELSE 'sent' END,
      CASE WHEN g % 2 = 0 THEN 'Você' ELSE l.name END,
      v_now - ((10 - g) || ' hours')::interval - ((i-1) || ' hours')::interval,
      'demo',
      true
    FROM public.leads l, generate_series(1,8) g
    WHERE l.id = v_lead_id;
  END LOOP;

  RETURN jsonb_build_object(
    'seeded',         true,
    'pipelines',      1,
    'stages',         5,
    'tags',           8,
    'leads',          array_length(v_lead_ids, 1),
    'professionals',  2,
    'reasons',        3,
    'appointments',   10,
    'conversations',  5
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_company_demo_data(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.seed_company_demo_data(uuid) TO service_role;

-- =========================================================
-- 3. delete_company_demo_data
-- =========================================================
CREATE OR REPLACE FUNCTION public.delete_company_demo_data(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_company uuid;
  v_is_admin boolean := false;
  v_is_master boolean := false;
  v_msgs int := 0; v_convs int := 0; v_appts int := 0; v_pros int := 0;
  v_reasons int := 0; v_leads int := 0; v_tags int := 0; v_stages int := 0; v_pipes int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  v_is_master := has_role(v_uid, 'master'::app_role);
  IF NOT v_is_master THEN
    SELECT get_user_company_id(v_uid) INTO v_user_company;
    v_is_admin := is_company_admin(v_uid);
    IF v_user_company IS DISTINCT FROM p_company_id OR NOT v_is_admin THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Ordem reversa de FKs
  WITH d AS (DELETE FROM public.chat_messages          WHERE company_id = p_company_id AND is_demo = true RETURNING 1) SELECT count(*) INTO v_msgs FROM d;
  WITH d AS (DELETE FROM public.conversations          WHERE company_id = p_company_id AND is_demo = true RETURNING 1) SELECT count(*) INTO v_convs FROM d;
  WITH d AS (DELETE FROM public.appointments           WHERE company_id = p_company_id AND is_demo = true RETURNING 1) SELECT count(*) INTO v_appts FROM d;
  WITH d AS (DELETE FROM public.appointment_professionals WHERE company_id = p_company_id AND is_demo = true RETURNING 1) SELECT count(*) INTO v_pros FROM d;
  WITH d AS (DELETE FROM public.appointment_reasons    WHERE company_id = p_company_id AND is_demo = true RETURNING 1) SELECT count(*) INTO v_reasons FROM d;
  -- leads cascateia lead_tags
  WITH d AS (DELETE FROM public.leads                  WHERE company_id = p_company_id AND is_demo = true RETURNING 1) SELECT count(*) INTO v_leads FROM d;
  WITH d AS (DELETE FROM public.tags                   WHERE company_id = p_company_id AND is_demo = true RETURNING 1) SELECT count(*) INTO v_tags FROM d;
  -- stages cascateiam pelo pipeline
  WITH d AS (DELETE FROM public.pipelines              WHERE company_id = p_company_id AND is_demo = true RETURNING 1) SELECT count(*) INTO v_pipes FROM d;

  RETURN jsonb_build_object(
    'chat_messages',   v_msgs,
    'conversations',   v_convs,
    'appointments',    v_appts,
    'professionals',   v_pros,
    'reasons',         v_reasons,
    'leads',           v_leads,
    'tags',            v_tags,
    'pipelines',       v_pipes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_company_demo_data(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.delete_company_demo_data(uuid) TO authenticated;

-- =========================================================
-- 4. count_company_demo_data
-- =========================================================
CREATE OR REPLACE FUNCTION public.count_company_demo_data(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_company uuid;
  v_is_master boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;
  v_is_master := has_role(v_uid, 'master'::app_role);
  IF NOT v_is_master THEN
    SELECT get_user_company_id(v_uid) INTO v_user_company;
    IF v_user_company IS DISTINCT FROM p_company_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'leads',         (SELECT count(*) FROM public.leads          WHERE company_id = p_company_id AND is_demo = true),
    'conversations', (SELECT count(*) FROM public.conversations  WHERE company_id = p_company_id AND is_demo = true),
    'appointments',  (SELECT count(*) FROM public.appointments   WHERE company_id = p_company_id AND is_demo = true),
    'tags',          (SELECT count(*) FROM public.tags           WHERE company_id = p_company_id AND is_demo = true),
    'pipelines',     (SELECT count(*) FROM public.pipelines      WHERE company_id = p_company_id AND is_demo = true),
    'professionals', (SELECT count(*) FROM public.appointment_professionals WHERE company_id = p_company_id AND is_demo = true)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.count_company_demo_data(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.count_company_demo_data(uuid) TO authenticated;