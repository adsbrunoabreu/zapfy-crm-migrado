-- Helper de validação de vínculo usuário↔empresa
CREATE OR REPLACE FUNCTION public.validate_user_belongs_to_company(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL AND _company_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = _user_id AND company_id = _company_id
    )
    OR EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema='public' AND table_name='user_companies'
    ) AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = _user_id AND p.company_id = _company_id
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.validate_user_belongs_to_company(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_user_belongs_to_company(uuid, uuid) TO authenticated, service_role;

-- Injeta guard no topo do corpo das funções alvo
DO $do$
DECLARE
  targets text[][] := ARRAY[
    -- [proname, param_name]
    ['get_dre_report','_company_id'],
    ['get_dre_comparison','_company_id'],
    ['get_dre_drill_down','_company_id'],
    ['get_dre_insights','_company_id'],
    ['get_company_plan_limits','_company_id'],
    ['get_company_plan_usage','_company_id'],
    ['get_company_trial_info','_company_id'],
    ['get_company_growth','_company_id'],
    ['get_financial_dashboard','_company_id'],
    ['get_financial_overview','_company_id'],
    ['get_attendance_reports','_company_id'],
    ['get_attendance_messages_by_hour','_company_id'],
    ['get_message_audit_list','_company_id'],
    ['get_webhook_retry_stats','_company_id'],
    ['get_evolution_proxy_metrics','_company_id'],
    ['get_ai_addon_usage','_company_id'],
    ['has_financial_access','_company_id'],
    ['check_ai_agent_limits','_company_id'],
    ['delete_company_demo_data','p_company_id'],
    ['count_company_demo_data','p_company_id'],
    ['ensure_financial_seed','_company_id'],
    ['ensure_dre_system_category','_company_id'],
    ['activate_medical_vertical','p_company_id'],
    ['get_pipeline_performance_report','_company_id']
  ];
  i int;
  v_proname text;
  v_param text;
  v_def text;
  v_guard text;
  v_marker text;
  v_pos int;
  v_new_def text;
  r record;
  v_count int;
BEGIN
  FOR i IN 1 .. array_length(targets, 1) LOOP
    v_proname := targets[i][1];
    v_param   := targets[i][2];

    v_guard :=
      E'  -- [security guard] auto-injected: bloqueia acesso cruzado entre empresas\n' ||
      E'  IF ' || v_param || E' IS NOT NULL\n' ||
      E'     AND auth.uid() IS NOT NULL\n' ||
      E'     AND NOT public.has_role(auth.uid(), ''master''::public.app_role)\n' ||
      E'     AND NOT public.validate_user_belongs_to_company(auth.uid(), ' || v_param || E') THEN\n' ||
      E'    RAISE EXCEPTION ''Acesso negado: usuário não pertence à empresa'' USING ERRCODE = ''42501'';\n' ||
      E'  END IF;\n';

    v_count := 0;
    FOR r IN
      SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_proname
    LOOP
      v_def := pg_get_functiondef(r.oid);

      -- Pula se já tem o guard injetado
      IF position('[security guard] auto-injected' IN v_def) > 0 THEN
        CONTINUE;
      END IF;

      -- Apenas plpgsql: precisa ter "BEGIN\n" após "AS $function$"
      v_marker := 'AS $function$';
      v_pos := position(v_marker IN v_def);
      IF v_pos = 0 THEN
        RAISE NOTICE 'skip %: AS $function$ marker not found', v_proname;
        CONTINUE;
      END IF;

      -- Localiza o primeiro "BEGIN" na linha após o marker
      DECLARE
        v_after text;
        v_begin_pos int;
        v_rest text;
        v_head text;
      BEGIN
        v_head := substr(v_def, 1, v_pos + length(v_marker) - 1);
        v_after := substr(v_def, v_pos + length(v_marker));

        -- procura "\nBEGIN\n" (case-sensitive); a função pode ter "BEGIN" precedido por whitespace/newline
        v_begin_pos := position(E'\nBEGIN\n' IN v_after);
        IF v_begin_pos = 0 THEN
          v_begin_pos := position(E'\nBEGIN ' IN v_after);
        END IF;
        IF v_begin_pos = 0 THEN
          RAISE NOTICE 'skip %: BEGIN not found', v_proname;
          CONTINUE;
        END IF;

        -- v_begin_pos aponta para o "\n" antes do BEGIN. Inserimos guard após "\nBEGIN\n"
        DECLARE
          v_begin_end int;
        BEGIN
          v_begin_end := v_begin_pos + length(E'\nBEGIN\n') - 1;
          v_rest := substr(v_after, v_begin_end + 1);
          v_new_def := v_head || substr(v_after, 1, v_begin_end) || v_guard || v_rest;
        END;

        EXECUTE v_new_def;
        v_count := v_count + 1;
        RAISE NOTICE 'patched %', v_proname;
      END;
    END LOOP;

    IF v_count = 0 THEN
      RAISE NOTICE 'no overloads patched for %', v_proname;
    END IF;
  END LOOP;
END
$do$;