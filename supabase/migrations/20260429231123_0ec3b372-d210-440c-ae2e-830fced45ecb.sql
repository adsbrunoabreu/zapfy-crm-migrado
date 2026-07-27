-- ============================================
-- FASE 4: Captura de avaliação por emojis
-- ============================================
CREATE OR REPLACE FUNCTION public.capture_rating_response_from_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _ticket_id UUID;
  _rating public.attendance_ticket_ratings;
  _txt TEXT;
  _num NUMERIC;
  _max NUMERIC;
BEGIN
  IF NEW.from_me THEN
    RETURN NEW;
  END IF;

  SELECT id INTO _ticket_id FROM public.attendance_tickets
  WHERE conversation_id = NEW.conversation_id
  ORDER BY created_at DESC LIMIT 1;
  IF _ticket_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO _rating FROM public.attendance_ticket_ratings
  WHERE ticket_id = _ticket_id AND status = 'pending'
  ORDER BY requested_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  _txt := COALESCE(NEW.content, '');
  IF length(_txt) = 0 OR length(_txt) > 200 THEN
    RETURN NEW;
  END IF;

  -- Tenta emoji primeiro
  IF _txt ~ '(😀|😄|😊|🙂|👍|❤️|⭐⭐⭐⭐⭐)' THEN
    _num := 5;
  ELSIF _txt ~ '(😐|😑|🤔|⭐⭐⭐)' THEN
    _num := 3;
  ELSIF _txt ~ '(😞|😠|😡|☹️|👎|⭐)' THEN
    _num := 1;
  ELSE
    -- Extrai número
    _num := NULLIF((regexp_match(_txt, '(\d+(?:[.,]\d+)?)'))[1], '')::NUMERIC;
  END IF;

  IF _num IS NULL THEN
    RETURN NEW;
  END IF;

  _max := CASE _rating.scale
    WHEN 'nps' THEN 10
    WHEN 'numeric' THEN 5
    ELSE 5
  END;
  IF _num < 0 OR _num > _max THEN
    RETURN NEW;
  END IF;

  IF _rating.response_window_hours > 0
     AND _rating.requested_at < now() - make_interval(hours => _rating.response_window_hours) THEN
    UPDATE public.attendance_ticket_ratings SET status = 'expired' WHERE id = _rating.id;
    RETURN NEW;
  END IF;

  UPDATE public.attendance_ticket_ratings
  SET score = _num,
      raw_response = _txt,
      responded_at = COALESCE(NEW.timestamp, now()),
      status = 'responded'
  WHERE id = _rating.id;

  RETURN NEW;
END;
$function$;

-- ============================================
-- Tabela: registra mensagens automáticas enviadas
-- ============================================
CREATE TABLE IF NOT EXISTS public.attendance_auto_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  message_kind TEXT NOT NULL CHECK (message_kind IN ('off_hours','welcome','wait_time')),
  body TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_msg_conv_kind 
  ON public.attendance_auto_messages(conversation_id, message_kind, sent_at DESC);

ALTER TABLE public.attendance_auto_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view auto messages"
  ON public.attendance_auto_messages FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR company_id = get_user_company_id(auth.uid()));

CREATE POLICY "System inserts auto messages"
  ON public.attendance_auto_messages FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

-- ============================================
-- Tabela: alertas de supervisor (anti-duplicação)
-- ============================================
CREATE TABLE IF NOT EXISTS public.ticket_supervisor_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  ticket_id UUID NOT NULL,
  alerted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  minutes_silent INT NOT NULL,
  recipients_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_alerts_ticket 
  ON public.ticket_supervisor_alerts(ticket_id, alerted_at DESC);

ALTER TABLE public.ticket_supervisor_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view supervisor alerts"
  ON public.ticket_supervisor_alerts FOR SELECT TO authenticated
  USING (is_master(auth.uid()) OR (company_id = get_user_company_id(auth.uid()) AND is_company_admin(auth.uid())));

-- ============================================
-- Função: verifica se está fora do expediente
-- ============================================
CREATE OR REPLACE FUNCTION public.is_off_business_hours(_company_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _bh JSONB;
  _tz TEXT;
  _local TIMESTAMPTZ;
  _dow INT;
  _day_keys TEXT[] := ARRAY['sun','mon','tue','wed','thu','fri','sat'];
  _key TEXT;
  _day JSONB;
  _start TIME;
  _end TIME;
  _now_time TIME;
  _today DATE;
  _holidays JSONB;
BEGIN
  SELECT business_hours, holidays INTO _bh, _holidays
  FROM public.attendance_settings WHERE company_id = _company_id;

  IF _bh IS NULL THEN
    RETURN false; -- sem config = sempre disponível
  END IF;

  _tz := COALESCE(_bh->>'timezone', 'America/Sao_Paulo');
  _local := now() AT TIME ZONE _tz;
  _today := _local::DATE;
  _now_time := _local::TIME;
  _dow := EXTRACT(DOW FROM _local)::INT; -- 0=dom

  -- Feriado?
  IF _holidays IS NOT NULL AND jsonb_typeof(_holidays) = 'array' THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(_holidays) h
      WHERE (h->>'date')::DATE = _today
    ) THEN
      RETURN true;
    END IF;
  END IF;

  _key := _day_keys[_dow + 1];
  _day := _bh->'days'->_key;

  IF _day IS NULL OR NOT COALESCE((_day->>'enabled')::BOOLEAN, false) THEN
    RETURN true;
  END IF;

  _start := (_day->>'start')::TIME;
  _end := (_day->>'end')::TIME;

  IF _now_time < _start OR _now_time > _end THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- ============================================
-- Função: lista tickets que precisam de alerta de supervisor
-- ============================================
CREATE OR REPLACE FUNCTION public.get_pending_supervisor_alerts()
RETURNS TABLE (
  ticket_id UUID,
  company_id UUID,
  ticket_code TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  assigned_to UUID,
  assigned_name TEXT,
  minutes_silent INT,
  threshold_minutes INT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH last_agent_msg AS (
    SELECT m.conversation_id, MAX(m.timestamp) AS last_at
    FROM public.chat_messages m
    WHERE m.from_me = true
    GROUP BY m.conversation_id
  ),
  last_customer_msg AS (
    SELECT m.conversation_id, MAX(m.timestamp) AS last_at
    FROM public.chat_messages m
    WHERE m.from_me = false
    GROUP BY m.conversation_id
  )
  SELECT
    t.id AS ticket_id,
    t.company_id,
    t.ticket_code,
    t.contact_name,
    t.contact_phone,
    t.assigned_to,
    COALESCE(p.full_name, p.email) AS assigned_name,
    EXTRACT(EPOCH FROM (now() - lcm.last_at))::INT / 60 AS minutes_silent,
    COALESCE((s.general->>'supervisor_alert_minutes')::INT, 0) AS threshold_minutes
  FROM public.attendance_tickets t
  JOIN public.attendance_settings s ON s.company_id = t.company_id
  LEFT JOIN public.profiles p ON p.id = t.assigned_to
  LEFT JOIN last_customer_msg lcm ON lcm.conversation_id = t.conversation_id
  LEFT JOIN last_agent_msg lam ON lam.conversation_id = t.conversation_id
  WHERE t.status IN ('open','in_progress','reopened')
    AND COALESCE((s.general->>'supervisor_alert_minutes')::INT, 0) > 0
    AND lcm.last_at IS NOT NULL
    AND (lam.last_at IS NULL OR lam.last_at < lcm.last_at)
    AND lcm.last_at < now() - make_interval(mins => COALESCE((s.general->>'supervisor_alert_minutes')::INT, 0))
    -- Não alertar se já foi alertado nas últimas 6h para o mesmo silêncio
    AND NOT EXISTS (
      SELECT 1 FROM public.ticket_supervisor_alerts a
      WHERE a.ticket_id = t.id
        AND a.alerted_at > lcm.last_at
    );
END;
$$;