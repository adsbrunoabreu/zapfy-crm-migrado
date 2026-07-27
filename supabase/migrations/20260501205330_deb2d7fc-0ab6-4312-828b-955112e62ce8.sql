-- 1) Coluna para metadados do preview
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS link_preview JSONB;

-- 2) Função que dispara a edge function quando há URL no conteúdo
CREATE OR REPLACE FUNCTION public.trigger_extract_link_preview()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  service_role_key text;
  url_match text;
BEGIN
  -- Apenas mensagens de texto sem preview já preenchido
  IF NEW.message_type IS DISTINCT FROM 'text' THEN
    RETURN NEW;
  END IF;
  IF NEW.link_preview IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.content IS NULL OR length(NEW.content) = 0 THEN
    RETURN NEW;
  END IF;

  -- Extrai a primeira URL do texto
  url_match := substring(NEW.content from 'https?://[^\s<>"'']+');
  IF url_match IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO supabase_url
    FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO service_role_key
    FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key' LIMIT 1;

  IF supabase_url IS NULL OR service_role_key IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/extract-link-preview',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'message_id', NEW.id,
      'url', url_match
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- 3) Trigger AFTER INSERT em chat_messages
DROP TRIGGER IF EXISTS trg_extract_link_preview ON public.chat_messages;
CREATE TRIGGER trg_extract_link_preview
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.trigger_extract_link_preview();