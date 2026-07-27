CREATE OR REPLACE FUNCTION public.seed_company_realistic(
  p_company_id uuid,
  p_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pipeline_id uuid;
  v_stage_ids uuid[];
  v_stage_count int;
  v_stage_open_ids uuid[];
  v_stage_won_id uuid;
  v_stage_lost_id uuid;
  v_agents uuid[];
  v_agent_count int;
  v_instance_name text;
  v_day timestamptz;
  v_day_count int;
  v_n_leads int;
  v_lead_id uuid;
  v_lead_name text;
  v_lead_phone text;
  v_lead_jid text;
  v_lead_value numeric;
  v_lead_status lead_status;
  v_stage_id uuid;
  v_assigned uuid;
  v_conv_id uuid;
  v_msg_count int;
  v_msg_seq int;
  v_msg_ts timestamptz;
  v_first_response_ts timestamptz;
  v_ticket_id uuid;
  v_ticket_number int;
  v_ticket_seq int := 0;
  v_appt_start timestamptz;
  v_first_names text[] := ARRAY['Ana','Bruno','Carla','Daniel','Eduarda','Felipe','Gabriela','Henrique','Isabela','João','Karina','Lucas','Mariana','Nicolas','Olivia','Pedro','Queila','Rafael','Sofia','Thiago','Ursula','Vinicius','Wesley','Yara','Zeca','Beatriz','Caio','Diego','Elaine','Fernanda','Gustavo','Helena','Igor','Juliana','Larissa','Marcos','Natalia','Otavio','Patricia','Rodrigo'];
  v_last_names text[] := ARRAY['Silva','Souza','Oliveira','Pereira','Lima','Costa','Rocha','Almeida','Ferreira','Carvalho','Ribeiro','Martins','Araujo','Barbosa','Cardoso','Dias','Fernandes','Gomes','Mendes','Nunes','Pinto','Ramos','Santos','Teixeira','Vieira'];
  v_in_msgs text[] := ARRAY['Oi, tudo bem?','Vi a propaganda de vocês no Instagram','Queria saber mais sobre o serviço','Quanto custa?','Vocês atendem na minha região?','Tenho interesse, podem me passar mais detalhes?','Pode me mandar uma proposta?','Vamos fechar então','Estou avaliando outras opções também','Obrigado pelo retorno!','Vou pensar e te dou um retorno','Top, gostei!'];
  v_out_msgs text[] := ARRAY['Olá! Tudo bem? Como podemos ajudar?','Claro, vou te explicar tudo','Posso te enviar nosso material por aqui','Vou preparar uma proposta personalizada','Você prefere falar agora ou mais tarde?','Perfeito, nos vemos lá','Qualquer dúvida estou à disposição','Excelente! Vou enviar o link de pagamento','Anotado, te aviso assim que estiver pronto','Que ótimo, fico feliz em ajudar!'];
  v_leads_created int := 0;
  v_msgs_created int := 0;
  v_tickets_created int := 0;
  v_ratings_created int := 0;
  v_appts_created int := 0;
  v_goals_created int := 0;
  r record;
  v_rng float;
  v_msg_status text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'master') THEN
    RAISE EXCEPTION 'Apenas Master pode semear dados' USING ERRCODE = '42501';
  END IF;
  IF p_days < 1 OR p_days > 180 THEN
    RAISE EXCEPTION 'p_days deve estar entre 1 e 180';
  END IF;

  SET LOCAL session_replication_role = 'replica';

  SELECT id INTO v_pipeline_id FROM public.pipelines
    WHERE company_id = p_company_id ORDER BY is_default DESC NULLS LAST, created_at ASC LIMIT 1;
  IF v_pipeline_id IS NULL THEN RAISE EXCEPTION 'Empresa sem pipeline configurado'; END IF;

  SELECT array_agg(id ORDER BY position) INTO v_stage_ids
    FROM public.pipeline_stages WHERE pipeline_id = v_pipeline_id;
  v_stage_count := coalesce(array_length(v_stage_ids,1), 0);
  IF v_stage_count = 0 THEN RAISE EXCEPTION 'Pipeline sem etapas'; END IF;

  SELECT array_agg(id ORDER BY position) INTO v_stage_open_ids
    FROM public.pipeline_stages WHERE pipeline_id = v_pipeline_id AND stage_type = 'open';
  SELECT id INTO v_stage_won_id FROM public.pipeline_stages
    WHERE pipeline_id = v_pipeline_id AND stage_type = 'won' LIMIT 1;
  SELECT id INTO v_stage_lost_id FROM public.pipeline_stages
    WHERE pipeline_id = v_pipeline_id AND stage_type = 'lost' LIMIT 1;
  IF coalesce(array_length(v_stage_open_ids,1),0) = 0 THEN v_stage_open_ids := v_stage_ids; END IF;

  SELECT array_agg(id) INTO v_agents FROM public.profiles
    WHERE company_id = p_company_id AND role <> 'master';
  v_agent_count := coalesce(array_length(v_agents,1), 0);
  IF v_agent_count = 0 THEN
    SELECT array_agg(id) INTO v_agents FROM public.profiles WHERE company_id = p_company_id;
    v_agent_count := coalesce(array_length(v_agents,1), 0);
  END IF;
  IF v_agent_count = 0 THEN RAISE EXCEPTION 'Empresa sem membros'; END IF;

  SELECT instance_name INTO v_instance_name FROM public.whatsapp_instances
    WHERE company_id = p_company_id ORDER BY created_at ASC LIMIT 1;
  v_instance_name := coalesce(v_instance_name, 'demo');

  SELECT coalesce(max(ticket_number), 0) INTO v_ticket_seq FROM public.attendance_tickets WHERE company_id = p_company_id;

  FOR v_day_count IN 0..p_days LOOP
    v_day := date_trunc('day', now()) - make_interval(days => v_day_count);
    v_n_leads := 2 + floor(random()*5)::int;

    FOR i IN 1..v_n_leads LOOP
      v_lead_name := v_first_names[1 + floor(random()*array_length(v_first_names,1))::int]
                  || ' ' || v_last_names[1 + floor(random()*array_length(v_last_names,1))::int];
      v_lead_phone := '5511' || lpad(floor(random()*900000000 + 100000000)::text, 9, '0');
      v_lead_jid := v_lead_phone || '@s.whatsapp.net';
      v_lead_value := round((300 + random()*9700)::numeric, 2);
      v_assigned := v_agents[1 + floor(random()*v_agent_count)::int];

      v_rng := random();
      IF v_rng < 0.10 AND v_stage_won_id IS NOT NULL THEN
        v_lead_status := 'won'; v_stage_id := v_stage_won_id;
      ELSIF v_rng < 0.20 AND v_stage_lost_id IS NOT NULL THEN
        v_lead_status := 'lost'; v_stage_id := v_stage_lost_id;
      ELSE
        v_lead_status := 'new';
        v_stage_id := v_stage_open_ids[1 + floor(random()*array_length(v_stage_open_ids,1))::int];
      END IF;

      INSERT INTO public.leads (
        company_id, pipeline_id, stage_id, name, phone, value, status,
        source, assigned_to, created_by, created_at, updated_at, is_demo,
        responded_at, closed_at
      ) VALUES (
        p_company_id, v_pipeline_id, v_stage_id, v_lead_name, v_lead_phone, v_lead_value, v_lead_status,
        (ARRAY['Instagram','Site','Indicação','WhatsApp','Google'])[1+floor(random()*5)::int],
        v_assigned, v_assigned, v_day + make_interval(mins => floor(random()*1440)::int), v_day,
        true,
        CASE WHEN random() < 0.7 THEN v_day + make_interval(mins => 5 + floor(random()*600)::int) ELSE NULL END,
        CASE WHEN v_lead_status IN ('won','lost') THEN v_day + make_interval(hours => 1 + floor(random()*48)::int) ELSE NULL END
      ) RETURNING id INTO v_lead_id;
      v_leads_created := v_leads_created + 1;

      INSERT INTO public.conversations (
        company_id, instance_name, remote_jid, phone, contact_name,
        lead_id, last_message_at, created_at, updated_at, is_demo, provider
      ) VALUES (
        p_company_id, v_instance_name, v_lead_jid, v_lead_phone, v_lead_name,
        v_lead_id, v_day, v_day, v_day, true, 'evolution'
      )
      ON CONFLICT (company_id, instance_name, remote_jid) DO UPDATE
        SET lead_id = EXCLUDED.lead_id, last_message_at = EXCLUDED.last_message_at
      RETURNING id INTO v_conv_id;

      v_msg_count := 4 + floor(random()*9)::int;
      v_msg_ts := v_day + make_interval(mins => floor(random()*60)::int);
      v_first_response_ts := NULL;

      FOR v_msg_seq IN 1..v_msg_count LOOP
        DECLARE
          v_from_me boolean := (v_msg_seq % 2 = 0);
          v_content text;
        BEGIN
          IF v_from_me THEN
            v_content := v_out_msgs[1 + floor(random()*array_length(v_out_msgs,1))::int];
            v_msg_status := (ARRAY['sent','delivered','read','read','read'])[1+floor(random()*5)::int];
            IF v_first_response_ts IS NULL THEN v_first_response_ts := v_msg_ts; END IF;
          ELSE
            v_content := v_in_msgs[1 + floor(random()*array_length(v_in_msgs,1))::int];
            v_msg_status := 'received';
          END IF;
          INSERT INTO public.chat_messages (
            company_id, conversation_id, remote_jid, message_id, from_me,
            message_type, content, status, sender_name, timestamp, created_at, provider
          ) VALUES (
            p_company_id, v_conv_id, v_lead_jid,
            'demo-' || v_conv_id::text || '-' || v_msg_seq::text,
            v_from_me, 'text', v_content, v_msg_status,
            CASE WHEN v_from_me THEN 'Atendente' ELSE v_lead_name END,
            v_msg_ts, v_msg_ts, 'evolution'
          );
          v_msgs_created := v_msgs_created + 1;
          v_msg_ts := v_msg_ts + make_interval(mins => 2 + floor(random()*30)::int);
        END;
      END LOOP;

      UPDATE public.conversations
        SET last_message_at = v_msg_ts, last_message_text = 'mensagem demo', updated_at = v_msg_ts
        WHERE id = v_conv_id;

      IF random() < 0.6 THEN
        v_ticket_seq := v_ticket_seq + 1;
        v_ticket_number := v_ticket_seq;
        INSERT INTO public.attendance_tickets (
          company_id, ticket_number, ticket_code, conversation_id, lead_id,
          contact_phone, contact_name, channel, status, priority,
          assigned_to, assigned_at, last_message_at, created_by, created_at, updated_at,
          closed_at, closed_by, close_reason
        ) VALUES (
          p_company_id, v_ticket_number, 'ATD-' || lpad(v_ticket_number::text, 6, '0'),
          v_conv_id, v_lead_id, v_lead_phone, v_lead_name, 'whatsapp',
          CASE WHEN v_lead_status IN ('won','lost') THEN 'closed'::ticket_status
               WHEN random() < 0.6 THEN 'in_progress'::ticket_status
               ELSE 'open'::ticket_status END,
          (ARRAY['Baixa','Média','Alta'])[1+floor(random()*3)::int],
          v_assigned, v_day, v_msg_ts, v_assigned, v_day, v_day,
          CASE WHEN v_lead_status IN ('won','lost') THEN v_day + make_interval(hours => 1 + floor(random()*24)::int) ELSE NULL END,
          CASE WHEN v_lead_status IN ('won','lost') THEN v_assigned ELSE NULL END,
          CASE WHEN v_lead_status = 'won' THEN 'Resolvido'
               WHEN v_lead_status = 'lost' THEN 'Sem retorno' ELSE NULL END
        ) RETURNING id INTO v_ticket_id;
        v_tickets_created := v_tickets_created + 1;

        IF v_lead_status IN ('won','lost') AND random() < 0.5 THEN
          INSERT INTO public.attendance_ticket_ratings (
            ticket_id, company_id, scale, score, status, requested_at, responded_at, response_window_hours
          ) VALUES (
            v_ticket_id, p_company_id, 'stars',
            (3 + floor(random()*3))::numeric, 'completed',
            v_day + make_interval(hours => 2), v_day + make_interval(hours => 3), 24
          );
          v_ratings_created := v_ratings_created + 1;
        END IF;
      END IF;

      IF v_lead_status = 'won' AND random() < 0.5 THEN
        v_appt_start := now() + make_interval(days => 1 + floor(random()*14)::int, hours => 9 + floor(random()*8)::int);
        INSERT INTO public.appointments (
          company_id, professional_id, lead_id, title,
          start_at, end_at, timezone, status, created_by, created_at, updated_at, is_demo
        ) VALUES (
          p_company_id, v_assigned, v_lead_id, 'Reunião com ' || v_lead_name,
          v_appt_start, v_appt_start + interval '1 hour',
          'America/Sao_Paulo', 'scheduled', v_assigned, v_day, v_day, true
        );
        v_appts_created := v_appts_created + 1;
      END IF;
    END LOOP;
  END LOOP;

  FOR r IN SELECT unnest(v_agents) AS agent_id LOOP
    INSERT INTO public.user_goals (company_id, user_id, goal_type, target_value, period_start, period_end, created_by)
    VALUES
      (p_company_id, r.agent_id, 'leads',       (30 + floor(random()*50))::numeric, date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date, r.agent_id),
      (p_company_id, r.agent_id, 'value',       (5000 + floor(random()*25000))::numeric, date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date, r.agent_id),
      (p_company_id, r.agent_id, 'conversions', (5 + floor(random()*15))::numeric, date_trunc('month', now())::date, (date_trunc('month', now()) + interval '1 month - 1 day')::date, r.agent_id)
    ON CONFLICT (company_id, user_id, goal_type, period_start, period_end) DO NOTHING;
    v_goals_created := v_goals_created + 3;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'company_id', p_company_id, 'days', p_days,
    'leads_created', v_leads_created, 'messages_created', v_msgs_created,
    'tickets_created', v_tickets_created, 'ratings_created', v_ratings_created,
    'appointments_created', v_appts_created, 'goals_created', v_goals_created
  );
END;
$$;