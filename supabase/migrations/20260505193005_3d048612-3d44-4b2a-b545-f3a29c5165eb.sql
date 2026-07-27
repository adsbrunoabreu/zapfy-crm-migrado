-- Backfill link_preview (buttons/list) para mensagens interativas históricas.

-- 1) templateMessage.hydratedTemplate.hydratedButtons
UPDATE public.chat_messages cm
SET link_preview = jsonb_build_object(
  'type', 'buttons',
  'buttons', (
    SELECT jsonb_agg(
      CASE
        WHEN btn ? 'urlButton' THEN jsonb_build_object('type','cta_url','display_text',COALESCE(btn #>> '{urlButton,displayText}','Abrir link'),'url',btn #>> '{urlButton,url}','id',NULL)
        WHEN btn ? 'quickReplyButton' THEN jsonb_build_object('type','quick_reply','display_text',COALESCE(btn #>> '{quickReplyButton,displayText}','Responder'),'url',NULL,'id',btn #>> '{quickReplyButton,id}')
        WHEN btn ? 'callButton' THEN jsonb_build_object('type','call','display_text',COALESCE(btn #>> '{callButton,displayText}','Ligar'),'url',NULL,'id',btn #>> '{callButton,phoneNumber}')
        ELSE jsonb_build_object('type','button','display_text','Botão','url',NULL,'id',NULL)
      END
    )
    FROM jsonb_array_elements(cm.raw_data #> '{message,templateMessage,hydratedTemplate,hydratedButtons}') btn
  )
)
WHERE cm.message_type = 'interactive'
  AND (cm.link_preview IS NULL OR NOT (cm.link_preview ? 'type'))
  AND jsonb_typeof(cm.raw_data #> '{message,templateMessage,hydratedTemplate,hydratedButtons}') = 'array';

-- 2) templateMessage.interactiveMessageTemplate.nativeFlowMessage.buttons (buttonParamsJson é string)
UPDATE public.chat_messages cm
SET link_preview = jsonb_build_object(
  'type','buttons',
  'buttons',(
    SELECT jsonb_agg(jsonb_build_object(
      'type', COALESCE(btn->>'name','button'),
      'display_text', COALESCE((btn->>'buttonParamsJson')::jsonb->>'display_text',(btn->>'buttonParamsJson')::jsonb->>'text','Clique aqui'),
      'url', (btn->>'buttonParamsJson')::jsonb->>'url',
      'id', (btn->>'buttonParamsJson')::jsonb->>'id'
    ))
    FROM jsonb_array_elements(cm.raw_data #> '{message,templateMessage,interactiveMessageTemplate,nativeFlowMessage,buttons}') btn
    WHERE btn->>'buttonParamsJson' IS NOT NULL
  )
)
WHERE cm.message_type = 'interactive'
  AND (cm.link_preview IS NULL OR NOT (cm.link_preview ? 'type'))
  AND jsonb_typeof(cm.raw_data #> '{message,templateMessage,interactiveMessageTemplate,nativeFlowMessage,buttons}') = 'array';

-- 3) buttonsMessage clássico
UPDATE public.chat_messages cm
SET link_preview = jsonb_build_object(
  'type','buttons',
  'buttons',(
    SELECT jsonb_agg(jsonb_build_object('type','quick_reply','display_text',COALESCE(btn #>> '{buttonText,displayText}','Botão'),'url',NULL,'id',btn->>'buttonId'))
    FROM jsonb_array_elements(cm.raw_data #> '{message,buttonsMessage,buttons}') btn
  )
)
WHERE cm.message_type = 'interactive'
  AND (cm.link_preview IS NULL OR NOT (cm.link_preview ? 'type'))
  AND jsonb_typeof(cm.raw_data #> '{message,buttonsMessage,buttons}') = 'array';

-- 4) listMessage
UPDATE public.chat_messages cm
SET link_preview = jsonb_build_object(
  'type','list',
  'button_text', COALESCE(cm.raw_data #>> '{message,listMessage,buttonText}','Ver opções'),
  'options', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id',row->>'rowId','title',COALESCE(row->>'title','Opção'),'description',COALESCE(row->>'description','')))
    FROM jsonb_array_elements(cm.raw_data #> '{message,listMessage,sections}') section,
         jsonb_array_elements(section->'rows') row
  ),'[]'::jsonb)
)
WHERE cm.message_type = 'interactive'
  AND (cm.link_preview IS NULL OR NOT (cm.link_preview ? 'type'))
  AND jsonb_typeof(cm.raw_data #> '{message,listMessage,sections}') = 'array';

-- 5) interactiveMessage.nativeFlowMessage.buttons
UPDATE public.chat_messages cm
SET link_preview = jsonb_build_object(
  'type','buttons',
  'buttons',(
    SELECT jsonb_agg(jsonb_build_object(
      'type', COALESCE(btn->>'name','button'),
      'display_text', COALESCE((btn->>'buttonParamsJson')::jsonb->>'display_text',(btn->>'buttonParamsJson')::jsonb->>'text','Clique aqui'),
      'url', (btn->>'buttonParamsJson')::jsonb->>'url',
      'id', (btn->>'buttonParamsJson')::jsonb->>'id'
    ))
    FROM jsonb_array_elements(cm.raw_data #> '{message,interactiveMessage,nativeFlowMessage,buttons}') btn
    WHERE btn->>'buttonParamsJson' IS NOT NULL
  )
)
WHERE cm.message_type = 'interactive'
  AND (cm.link_preview IS NULL OR NOT (cm.link_preview ? 'type'))
  AND jsonb_typeof(cm.raw_data #> '{message,interactiveMessage,nativeFlowMessage,buttons}') = 'array';