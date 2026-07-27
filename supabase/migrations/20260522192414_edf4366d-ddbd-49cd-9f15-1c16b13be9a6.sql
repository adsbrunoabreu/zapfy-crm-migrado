
CREATE OR REPLACE FUNCTION public.canonical_remote_jid(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  s text;
  digits text;
BEGIN
  IF input IS NULL THEN RETURN NULL; END IF;
  s := input;
  IF s ~* '@g\.us$' THEN
    digits := regexp_replace(regexp_replace(s, '@g\.us$', '', 'i'), '[^0-9]', '', 'g');
    IF digits = '' THEN RETURN NULL; END IF;
    RETURN digits || '@g.us';
  END IF;
  s := regexp_replace(s, '@s\.whatsapp\.net$', '', 'i');
  s := regexp_replace(s, '@c\.us$', '', 'i');
  digits := regexp_replace(s, '[^0-9]', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;
  IF length(digits) = 13 AND substring(digits, 1, 2) = '55' AND substring(digits, 5, 1) = '9' THEN
    digits := substring(digits, 1, 4) || substring(digits, 6);
  END IF;
  RETURN digits;
END;
$fn$;

DO $body$
DECLARE
  grp RECORD;
  survivor_id uuid;
  losers uuid[];
BEGIN
  FOR grp IN
    SELECT company_id, instance_name, public.canonical_remote_jid(remote_jid) AS canon
    FROM public.conversations
    WHERE remote_jid IS NOT NULL
    GROUP BY company_id, instance_name, public.canonical_remote_jid(remote_jid)
    HAVING count(*) > 1
  LOOP
    SELECT c.id INTO survivor_id
    FROM public.conversations c
    LEFT JOIN LATERAL (SELECT count(*) AS n FROM public.chat_messages m WHERE m.conversation_id = c.id) mc ON true
    WHERE c.company_id = grp.company_id
      AND c.instance_name = grp.instance_name
      AND public.canonical_remote_jid(c.remote_jid) = grp.canon
    ORDER BY (mc.n > 0) DESC, c.created_at ASC
    LIMIT 1;

    SELECT array_agg(id) INTO losers
    FROM public.conversations
    WHERE company_id = grp.company_id
      AND instance_name = grp.instance_name
      AND public.canonical_remote_jid(remote_jid) = grp.canon
      AND id <> survivor_id;

    UPDATE public.chat_messages SET conversation_id = survivor_id WHERE conversation_id = ANY(losers);

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='attendance_tickets' AND column_name='conversation_id') THEN
      EXECUTE 'UPDATE public.attendance_tickets SET conversation_id = $1 WHERE conversation_id = ANY($2)'
        USING survivor_id, losers;
    END IF;

    UPDATE public.conversations s SET
      contact_photo_url = COALESCE(s.contact_photo_url, l.contact_photo_url),
      contact_name      = COALESCE(s.contact_name, l.contact_name),
      contact_id        = COALESCE(s.contact_id, l.contact_id),
      lead_id           = COALESCE(s.lead_id, l.lead_id),
      last_message_text = CASE WHEN COALESCE(s.last_message_at, 'epoch'::timestamptz)
                                  >= COALESCE(l.last_message_at, 'epoch'::timestamptz)
                                THEN s.last_message_text ELSE l.last_message_text END,
      last_message_at   = GREATEST(COALESCE(s.last_message_at, 'epoch'::timestamptz),
                                   COALESCE(l.last_message_at, 'epoch'::timestamptz)),
      unread_count      = COALESCE(s.unread_count,0) + COALESCE(l.unread_count,0)
    FROM (
      SELECT
        (array_agg(contact_photo_url) FILTER (WHERE contact_photo_url IS NOT NULL))[1] AS contact_photo_url,
        (array_agg(contact_name)      FILTER (WHERE contact_name IS NOT NULL))[1]      AS contact_name,
        (array_agg(contact_id)        FILTER (WHERE contact_id IS NOT NULL))[1]        AS contact_id,
        (array_agg(lead_id)           FILTER (WHERE lead_id IS NOT NULL))[1]           AS lead_id,
        max(last_message_at)                                                            AS last_message_at,
        (array_agg(last_message_text ORDER BY last_message_at DESC NULLS LAST))[1]      AS last_message_text,
        sum(COALESCE(unread_count,0))::int                                              AS unread_count
      FROM public.conversations WHERE id = ANY(losers)
    ) l
    WHERE s.id = survivor_id;

    DELETE FROM public.conversations WHERE id = ANY(losers);
  END LOOP;
END
$body$;

UPDATE public.conversations
SET remote_jid = public.canonical_remote_jid(remote_jid),
    phone = COALESCE(NULLIF(regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g'),''), phone)
WHERE remote_jid IS DISTINCT FROM public.canonical_remote_jid(remote_jid);

UPDATE public.chat_messages
SET remote_jid = public.canonical_remote_jid(remote_jid)
WHERE remote_jid IS NOT NULL
  AND remote_jid IS DISTINCT FROM public.canonical_remote_jid(remote_jid);

CREATE OR REPLACE FUNCTION public.tg_conversations_canonical_jid()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $tg$
BEGIN
  IF NEW.remote_jid IS NOT NULL THEN
    NEW.remote_jid := public.canonical_remote_jid(NEW.remote_jid);
  END IF;
  RETURN NEW;
END;
$tg$;
DROP TRIGGER IF EXISTS conversations_canonical_jid ON public.conversations;
CREATE TRIGGER conversations_canonical_jid
BEFORE INSERT OR UPDATE OF remote_jid ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.tg_conversations_canonical_jid();

CREATE OR REPLACE FUNCTION public.tg_chat_messages_canonical_jid()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $tg$
BEGIN
  IF NEW.remote_jid IS NOT NULL THEN
    NEW.remote_jid := public.canonical_remote_jid(NEW.remote_jid);
  END IF;
  RETURN NEW;
END;
$tg$;
DROP TRIGGER IF EXISTS chat_messages_canonical_jid ON public.chat_messages;
CREATE TRIGGER chat_messages_canonical_jid
BEFORE INSERT OR UPDATE OF remote_jid ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.tg_chat_messages_canonical_jid();
