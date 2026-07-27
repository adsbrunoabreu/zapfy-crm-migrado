CREATE OR REPLACE FUNCTION public.notify_today_birthdays()
RETURNS TABLE(notifications_created int, contacts_processed int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _created int := 0;
  _processed int := 0;
  _contact RECORD;
  _recipient uuid;
  _age int;
  _title text;
  _message text;
BEGIN
  FOR _contact IN
    SELECT c.id, c.company_id, c.name, c.birth_date, c.assigned_to
      FROM public.contacts c
     WHERE c.birth_date IS NOT NULL
       AND EXTRACT(MONTH FROM c.birth_date) = EXTRACT(MONTH FROM _today)
       AND EXTRACT(DAY   FROM c.birth_date) = EXTRACT(DAY   FROM _today)
  LOOP
    _processed := _processed + 1;
    _age := CASE
      WHEN EXTRACT(YEAR FROM _contact.birth_date) < EXTRACT(YEAR FROM _today)
        AND EXTRACT(YEAR FROM _contact.birth_date) > 1900
      THEN EXTRACT(YEAR FROM _today)::int - EXTRACT(YEAR FROM _contact.birth_date)::int
      ELSE NULL
    END;

    _title := 'Aniversário hoje: ' || _contact.name;
    _message := CASE
      WHEN _age IS NOT NULL THEN 'Faz ' || _age || ' anos hoje 🎂'
      ELSE 'É aniversário do contato hoje 🎂'
    END;

    -- Destinatários: assigned_to + admins da empresa, deduplicado
    FOR _recipient IN
      SELECT DISTINCT u
        FROM (
          SELECT _contact.assigned_to AS u WHERE _contact.assigned_to IS NOT NULL
          UNION
          SELECT ur.user_id AS u
            FROM public.user_roles ur
           WHERE ur.role = 'admin'
             AND EXISTS (
               SELECT 1 FROM public.profiles p
                WHERE p.id = ur.user_id
                  AND p.company_id = _contact.company_id
             )
        ) sub
       WHERE u IS NOT NULL
    LOOP
      -- Idempotência: pula se já existe notificação do mesmo contato para este usuário hoje
      IF NOT EXISTS (
        SELECT 1 FROM public.app_notifications n
         WHERE n.user_id = _recipient
           AND n.type = 'contact_birthday'
           AND n.metadata->>'contact_id' = _contact.id::text
           AND (n.created_at AT TIME ZONE 'America/Sao_Paulo')::date = _today
      ) THEN
        INSERT INTO public.app_notifications
          (user_id, company_id, type, title, message, severity, link, metadata)
        VALUES (
          _recipient,
          _contact.company_id,
          'contact_birthday',
          _title,
          _message,
          'info',
          '/contatos?contact=' || _contact.id::text,
          jsonb_build_object(
            'contact_id', _contact.id,
            'contact_name', _contact.name,
            'birth_date', _contact.birth_date,
            'age', _age
          )
        );
        _created := _created + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN QUERY SELECT _created, _processed;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_today_birthdays() FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.notify_today_birthdays() TO authenticated, service_role;