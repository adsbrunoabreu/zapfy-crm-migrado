
-- Lê schedule atual dos crons de alertas (Master only)
CREATE OR REPLACE FUNCTION public.get_alert_cron_frequencies()
RETURNS TABLE(job_key text, jobname text, schedule text, active boolean, minutes int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
BEGIN
  IF NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN QUERY
  SELECT
    CASE
      WHEN j.jobname LIKE 'monitor-instance-health%' THEN 'monitor-instance-health'
      WHEN j.jobname LIKE 'auto-reconnect-instances%' THEN 'auto-reconnect-instances'
    END AS job_key,
    j.jobname,
    j.schedule,
    j.active,
    CASE
      WHEN j.schedule = '* * * * *' THEN 1
      WHEN j.schedule ~ '^\*/[0-9]+ \* \* \* \*$' THEN
        substring(j.schedule from '^\*/([0-9]+)')::int
      ELSE NULL
    END AS minutes
  FROM cron.job j
  WHERE j.jobname LIKE 'monitor-instance-health%'
     OR j.jobname LIKE 'auto-reconnect-instances%';
END;
$$;

REVOKE ALL ON FUNCTION public.get_alert_cron_frequencies() FROM public;
GRANT EXECUTE ON FUNCTION public.get_alert_cron_frequencies() TO authenticated;

-- Reagenda os crons de alertas (Master only, valores 1/2/5)
CREATE OR REPLACE FUNCTION public.set_alert_cron_frequency(_job text, _minutes int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, cron
AS $$
DECLARE
  v_existing_jobname text;
  v_command text;
  v_new_schedule text;
  v_new_jobname text;
BEGIN
  IF NOT public.is_master(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF _job NOT IN ('monitor-instance-health', 'auto-reconnect-instances') THEN
    RAISE EXCEPTION 'Job not allowed: %', _job;
  END IF;
  IF _minutes NOT IN (1, 2, 5) THEN
    RAISE EXCEPTION 'Frequência inválida (use 1, 2 ou 5)';
  END IF;

  -- Busca o cron existente que comece com o nome do job
  SELECT j.jobname, j.command
    INTO v_existing_jobname, v_command
  FROM cron.job j
  WHERE j.jobname LIKE _job || '%'
  ORDER BY j.jobid DESC
  LIMIT 1;

  IF v_existing_jobname IS NULL THEN
    RAISE EXCEPTION 'Cron job não encontrado para %', _job;
  END IF;

  v_new_schedule := CASE WHEN _minutes = 1 THEN '* * * * *'
                         ELSE '*/' || _minutes::text || ' * * * *' END;
  v_new_jobname := _job || '-' || _minutes::text || 'min';

  -- Remove qualquer agendamento anterior do mesmo job (incluindo o atual)
  PERFORM cron.unschedule(j.jobname)
    FROM cron.job j
    WHERE j.jobname LIKE _job || '%';

  -- Reagenda preservando o command original (URL + auth)
  PERFORM cron.schedule(v_new_jobname, v_new_schedule, v_command);

  INSERT INTO public.system_logs (source, level, event, message, metadata)
  VALUES (
    'alert_cron',
    'info',
    'alert_cron.frequency_changed',
    'Frequência de cron de alerta alterada',
    jsonb_build_object(
      'job', _job,
      'minutes', _minutes,
      'previous_jobname', v_existing_jobname,
      'new_jobname', v_new_jobname,
      'changed_by', auth.uid()
    )
  );

  RETURN jsonb_build_object(
    'job', _job,
    'minutes', _minutes,
    'jobname', v_new_jobname,
    'schedule', v_new_schedule
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_alert_cron_frequency(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.set_alert_cron_frequency(text, int) TO authenticated;
