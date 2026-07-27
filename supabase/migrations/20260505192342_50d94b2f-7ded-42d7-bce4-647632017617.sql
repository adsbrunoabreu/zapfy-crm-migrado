-- Backfill de mensagens interativas que ficaram com content vazio
-- por falta de mapeamento no parser do evolution-webhook.

WITH interactive AS (
  SELECT
    id,
    raw_data->'message' AS msg,
    -- texto extraído conforme o subtipo
    COALESCE(
      raw_data #>> '{message,templateMessage,hydratedTemplate,hydratedContentText}',
      raw_data #>> '{message,templateMessage,interactiveMessageTemplate,body,text}',
      raw_data #>> '{message,buttonsMessage,contentText}',
      raw_data #>> '{message,listMessage,description}',
      raw_data #>> '{message,listMessage,title}',
      raw_data #>> '{message,interactiveMessage,body,text}',
      raw_data #>> '{message,interactiveMessage,header,title}',
      raw_data #>> '{message,buttonsResponseMessage,selectedDisplayText}',
      raw_data #>> '{message,listResponseMessage,title}',
      raw_data #>> '{message,templateButtonReplyMessage,selectedDisplayText}'
    ) AS extracted_text,
    CASE
      WHEN raw_data #> '{message,buttonsResponseMessage}' IS NOT NULL THEN 'text'
      WHEN raw_data #> '{message,listResponseMessage}' IS NOT NULL THEN 'text'
      WHEN raw_data #> '{message,templateButtonReplyMessage}' IS NOT NULL THEN 'text'
      ELSE 'interactive'
    END AS new_type
  FROM public.chat_messages
  WHERE (content IS NULL OR content = '')
    AND raw_data IS NOT NULL
    AND raw_data ? 'message'
    AND (
      raw_data->'message' ? 'templateMessage'
      OR raw_data->'message' ? 'buttonsMessage'
      OR raw_data->'message' ? 'listMessage'
      OR raw_data->'message' ? 'interactiveMessage'
      OR raw_data->'message' ? 'buttonsResponseMessage'
      OR raw_data->'message' ? 'listResponseMessage'
      OR raw_data->'message' ? 'templateButtonReplyMessage'
    )
)
UPDATE public.chat_messages cm
SET
  content = COALESCE(NULLIF(i.extracted_text, ''), '[Mensagem interativa]'),
  message_type = i.new_type
FROM interactive i
WHERE cm.id = i.id;