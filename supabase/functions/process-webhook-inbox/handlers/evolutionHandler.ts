/**
 * evolutionHandler — recebe payloads da Evolution API e persiste mensagens
 * normalizadas em `chat_messages`.
 *
 * Estratégia (sem importar código do `src/` — edge functions não têm acesso
 * ao bundle do React): replicamos aqui o mínimo necessário do
 * `ProviderService.processWebhook('evolution', ...)`:
 *   1. Resolver a `whatsapp_instances` pela `instance` ou `instance_name`.
 *   2. Validar `apikey` (header) contra `instance.config.apiKey`.
 *   3. Normalizar o payload para o shape canônico de `chat_messages`.
 *   4. Upsert da conversa + upsert idempotente da mensagem.
 *   5. Logar tudo em `message_sync_log`.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface HandlerCtx {
  supabase: SupabaseClient
  headers: Headers
  rawBody: string
  payload: unknown
  log: (
    s: SupabaseClient,
    row: {
      company_id?: string | null
      conversation_id?: string | null
      event: string
      provider: 'evolution' | 'cloud_api' | 'unknown'
      status: 'success' | 'error' | 'warning'
      error_message?: string | null
      metadata?: Record<string, unknown>
    },
  ) => Promise<void>
}

interface InstanceRow {
  id: string
  company_id: string
  instance_name: string
  config: Record<string, unknown>
}

function pickString(o: unknown, ...keys: string[]): string | null {
  if (!o || typeof o !== 'object') return null
  const obj = o as Record<string, unknown>
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

function normalizeJid(jid: string | null): string {
  if (!jid) return ''
  return jid.replace(/@s\.whatsapp\.net$/i, '').replace(/@c\.us$/i, '').replace(/[^\d+]/g, '')
}

function sanitizeText(s: unknown, max = 4096): string {
  if (typeof s !== 'string') return ''
  return s.replace(/\u0000/g, '').slice(0, max)
}
function sanitizeShort(s: unknown, max = 128): string | null {
  if (typeof s !== 'string') return null
  const v = s.replace(/\u0000/g, '').trim().slice(0, max)
  return v || null
}

interface DetectedMessage {
  type:
    | 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker'
    | 'location' | 'contact' | 'reaction' | 'interactive' | 'unknown'
  content: string | null
  mediaUrl: string | null
  mediaMime: string | null
  fileName: string | null
  duration: number | null
  linkPreview: Record<string, unknown> | null
}

export function detectMessageType(message: Record<string, unknown>): DetectedMessage {
  const get = (k: string) => message[k] as Record<string, unknown> | undefined
  const base = { mediaUrl: null, mediaMime: null, fileName: null, duration: null, linkPreview: null }

  if (typeof message.conversation === 'string') {
    return { type: 'text', content: message.conversation, ...base }
  }
  if (get('extendedTextMessage')) {
    return { type: 'text', content: pickString(get('extendedTextMessage'), 'text'), ...base }
  }
  if (get('imageMessage')) {
    const m = get('imageMessage')!
    return { type: 'image', content: pickString(m, 'caption'), mediaUrl: pickString(m, 'url'), mediaMime: pickString(m, 'mimetype'), fileName: null, duration: null, linkPreview: null }
  }
  if (get('videoMessage')) {
    const m = get('videoMessage')!
    return { type: 'video', content: pickString(m, 'caption'), mediaUrl: pickString(m, 'url'), mediaMime: pickString(m, 'mimetype'), fileName: null, duration: Number(m.seconds) || null, linkPreview: null }
  }
  if (get('audioMessage')) {
    const m = get('audioMessage')!
    return { type: 'audio', content: null, mediaUrl: pickString(m, 'url'), mediaMime: pickString(m, 'mimetype'), fileName: null, duration: Number(m.seconds) || null, linkPreview: null }
  }
  if (get('documentMessage')) {
    const m = get('documentMessage')!
    return { type: 'document', content: pickString(m, 'caption'), mediaUrl: pickString(m, 'url'), mediaMime: pickString(m, 'mimetype'), fileName: pickString(m, 'fileName'), duration: null, linkPreview: null }
  }
  if (get('stickerMessage')) {
    const m = get('stickerMessage')!
    return { type: 'sticker', content: null, mediaUrl: pickString(m, 'url'), mediaMime: pickString(m, 'mimetype'), fileName: null, duration: null, linkPreview: null }
  }
  if (get('locationMessage')) {
    return { type: 'location', content: '[location]', ...base }
  }
  if (get('contactMessage') || get('contactsArrayMessage')) {
    return { type: 'contact', content: '[contact]', ...base }
  }
  if (get('reactionMessage')) {
    return { type: 'reaction', content: pickString(get('reactionMessage'), 'text'), ...base }
  }

  // ============================================================
  // INBOUND INTERATIVAS (template/buttons/list/interactiveMessage)
  // — preserva botões/opções no link_preview para renderização.
  // ============================================================
  const tplMsg = get('templateMessage') as any
  if (tplMsg) {
    const tpl = tplMsg.hydratedTemplate ?? tplMsg.interactiveMessageTemplate
    let content = '[Mensagem de template]'
    let linkPreview: Record<string, unknown> | null = null
    if (tpl) {
      content = sanitizeText(tpl.hydratedContentText ?? tpl.body?.text ?? '[Mensagem de template]')
      const rawButtons = tpl.nativeFlowMessage?.buttons ?? tpl.hydratedButtons
      if (Array.isArray(rawButtons) && rawButtons.length > 0) {
        const buttons = rawButtons.map((btn: any) => {
          if (btn.urlButton) return { type: 'cta_url', display_text: sanitizeShort(btn.urlButton.displayText, 80) || 'Abrir link', url: sanitizeShort(btn.urlButton.url, 500), id: null }
          if (btn.quickReplyButton) return { type: 'quick_reply', display_text: sanitizeShort(btn.quickReplyButton.displayText, 80) || 'Responder', url: null, id: sanitizeShort(btn.quickReplyButton.id, 128) }
          if (btn.callButton) return { type: 'call', display_text: sanitizeShort(btn.callButton.displayText, 80) || 'Ligar', url: null, id: sanitizeShort(btn.callButton.phoneNumber, 32) }
          try {
            const params = JSON.parse(btn.buttonParamsJson || '{}')
            return { type: btn.name || 'button', display_text: sanitizeShort(params.display_text || params.text || 'Clique aqui', 80), url: sanitizeShort(params.url || null, 500), id: sanitizeShort(params.id || null, 128) }
          } catch {
            return { type: btn.name || 'button', display_text: 'Botão', url: null, id: null }
          }
        })
        linkPreview = { type: 'buttons', buttons }
      }
    }
    return { type: 'interactive', content, mediaUrl: null, mediaMime: null, fileName: null, duration: null, linkPreview }
  }

  const btnMsg = get('buttonsMessage') as any
  if (btnMsg) {
    const content = sanitizeText(btnMsg.contentText || '[Mensagem com botões]')
    let linkPreview: Record<string, unknown> | null = null
    if (Array.isArray(btnMsg.buttons)) {
      const buttons = btnMsg.buttons.map((btn: any) => ({
        type: 'quick_reply',
        display_text: sanitizeShort(btn.buttonText?.displayText || 'Botão', 80),
        url: null,
        id: sanitizeShort(btn.buttonId || '', 128),
      }))
      linkPreview = { type: 'buttons', buttons }
    }
    return { type: 'interactive', content, mediaUrl: null, mediaMime: null, fileName: null, duration: null, linkPreview }
  }

  const listMsg = get('listMessage') as any
  if (listMsg) {
    const content = sanitizeText(listMsg.description ?? listMsg.title ?? '[Selecione uma opção]')
    const options: any[] = []
    if (Array.isArray(listMsg.sections)) {
      for (const section of listMsg.sections) {
        if (Array.isArray(section.rows)) {
          for (const row of section.rows) {
            options.push({
              id: sanitizeShort(row.rowId || '', 128),
              title: sanitizeShort(row.title || 'Opção', 80),
              description: sanitizeShort(row.description || '', 200),
            })
          }
        }
      }
    }
    const linkPreview = {
      type: 'list',
      button_text: sanitizeShort(listMsg.buttonText, 80) || 'Ver opções',
      options,
    }
    return { type: 'interactive', content, mediaUrl: null, mediaMime: null, fileName: null, duration: null, linkPreview }
  }

  const intMsg = get('interactiveMessage') as any
  if (intMsg) {
    const content = sanitizeText(intMsg.body?.text ?? intMsg.header?.title ?? '[Mensagem interativa]')
    let linkPreview: Record<string, unknown> | null = null
    const rawButtons = intMsg.nativeFlowMessage?.buttons
    if (Array.isArray(rawButtons) && rawButtons.length > 0) {
      const buttons = rawButtons.map((btn: any) => {
        try {
          const params = JSON.parse(btn.buttonParamsJson || '{}')
          return { type: btn.name || 'button', display_text: sanitizeShort(params.display_text || 'Clique aqui', 80), url: sanitizeShort(params.url || null, 500), id: sanitizeShort(params.id || null, 128) }
        } catch {
          return { type: btn.name || 'button', display_text: 'Clique aqui', url: null, id: null }
        }
      })
      linkPreview = { type: 'buttons', buttons }
    }
    return { type: 'interactive', content, mediaUrl: null, mediaMime: null, fileName: null, duration: null, linkPreview }
  }

  // ============================================================
  // RESPOSTAS A INTERAÇÕES (cliques do usuário) — viram TEXTO
  // ============================================================
  const btnResp = get('buttonsResponseMessage') as any
  if (btnResp) {
    return { type: 'text', content: sanitizeText(btnResp.selectedDisplayText || 'Opção selecionada'), ...base }
  }
  const listResp = get('listResponseMessage') as any
  if (listResp) {
    return {
      type: 'text',
      content: sanitizeText(listResp.title ?? listResp.singleSelectReply?.selectedRowId ?? 'Opção selecionada'),
      ...base,
    }
  }
  const tplResp = get('templateButtonReplyMessage') as any
  if (tplResp) {
    return { type: 'text', content: sanitizeText(tplResp.selectedDisplayText || 'Opção'), ...base }
  }
  const intResp = get('interactiveResponseMessage') as any
  if (intResp) {
    let parsed: any = null
    try { parsed = JSON.parse(intResp.nativeFlowResponseMessage?.paramsJson || '{}') } catch { /* ignore */ }
    return {
      type: 'text',
      content: sanitizeText(parsed?.id ?? parsed?.display_text ?? intResp.body?.text ?? 'Resposta recebida'),
      ...base,
    }
  }
  const flowResp = get('nativeFlowResponseMessage') as any
  if (flowResp) {
    let parsed: any = null
    try { parsed = JSON.parse(flowResp.paramsJson || '{}') } catch { /* ignore */ }
    return {
      type: 'text',
      content: sanitizeText(parsed?.id ?? parsed?.display_text ?? flowResp.body?.text ?? 'Resposta recebida'),
      ...base,
    }
  }

  return { type: 'unknown', content: null, ...base }
}

export async function handleEvolution(ctx: HandlerCtx): Promise<{ messageId?: string; ignored?: string }> {
  const { supabase, headers, payload, log } = ctx
  const env = (payload ?? {}) as Record<string, unknown>

  const eventName = String(env.event ?? '').toLowerCase().replace(/_/g, '.')
  const instanceName = (typeof env.instance === 'string' ? env.instance : null) ??
    (typeof (env.instance as Record<string, unknown> | undefined)?.instanceName === 'string'
      ? ((env.instance as Record<string, unknown>).instanceName as string)
      : null)

  if (!instanceName) {
    await log(supabase, { event: 'evolution.no_instance', provider: 'evolution', status: 'warning' })
    return { ignored: 'no_instance' }
  }

  // Resolve instance row
  const { data: instance, error: instErr } = await supabase
    .from('whatsapp_instances')
    .select('id, company_id, instance_name, config')
    .eq('provider', 'evolution')
    .eq('instance_name', instanceName)
    .maybeSingle()

  if (instErr || !instance) {
    await log(supabase, {
      event: 'evolution.instance_not_found',
      provider: 'evolution',
      status: 'error',
      error_message: instErr?.message ?? `instance ${instanceName} ausente`,
      metadata: { instance_name: instanceName },
    })
    return { ignored: 'instance_not_found' }
  }

  const inst = instance as unknown as InstanceRow
  const expectedKey = (inst.config?.apiKey as string | undefined) ??
    (inst.config?.['api_key'] as string | undefined) ?? null
  const headerKey = headers.get('apikey') ?? headers.get('x-evolution-apikey')
  // Apikey obrigatória. O router rejeita quando ausente; aqui é defesa em profundidade.
  if (!headerKey) {
    await log(supabase, {
      company_id: inst.company_id,
      event: 'evolution.apikey_missing',
      provider: 'evolution',
      status: 'error',
      error_message: 'header apikey ausente',
    })
    return { ignored: 'missing_apikey' }
  }
  if (expectedKey && headerKey !== expectedKey) {
    await log(supabase, {
      company_id: inst.company_id,
      event: 'evolution.signature_invalid',
      provider: 'evolution',
      status: 'error',
      error_message: 'apikey header mismatch',
    })
    return { ignored: 'invalid_signature' }
  }

  // Conexão (queda/retorno) — propaga em tempo real para whatsapp_instances,
  // instance_health e instance_events sem esperar o cron de 1 min.
  if (eventName === 'connection.update') {
    const data = (env.data ?? {}) as Record<string, unknown>
    const state = String(data.state ?? data.status ?? '').toLowerCase()
    if (!state) {
      return { ignored: 'connection_update_no_state' }
    }
    const statusMap: Record<string, string> = {
      open: 'connected',
      close: 'disconnected',
      connecting: 'connecting',
    }
    const dbStatus = statusMap[state] ?? state
    const isConnected = dbStatus === 'connected'

    const sanitizePhone = (raw: unknown): string | null => {
      if (raw == null) return null
      const str = typeof raw === 'number' ? String(raw) : String(raw || '')
      if (!str) return null
      const digits = str.split('@')[0].split(':')[0].replace(/\D/g, '')
      return digits.length >= 10 && digits.length <= 15 ? digits : null
    }
    const phoneFromJid =
      sanitizePhone((data as any)?.wuid) ||
      sanitizePhone((data as any)?.owner) ||
      sanitizePhone((data as any)?.ownerJid) ||
      sanitizePhone((data as any)?.jid) ||
      sanitizePhone((data as any)?.number) ||
      sanitizePhone((data as any)?.phone) ||
      sanitizePhone((data as any)?.me) ||
      sanitizePhone((data as any)?.user) ||
      sanitizePhone((env as any)?.sender) ||
      null

    const updatePayload: Record<string, unknown> = {
      status: dbStatus,
      updated_at: new Date().toISOString(),
    }
    if (isConnected && phoneFromJid) updatePayload.phone_connected = phoneFromJid
    if (state === 'close') updatePayload.phone_connected = null

    await supabase
      .from('whatsapp_instances')
      .update(updatePayload)
      .eq('id', inst.id)

    // Lê estado anterior em instance_health para detectar transição
    const { data: prev } = await supabase
      .from('instance_health')
      .select('last_state, down_since, down_alerted_at, recovered_alerted_at, scope')
      .eq('instance_name', inst.instance_name)
      .maybeSingle()

    const wasConnected = prev ? (prev.last_state === 'open' || prev.last_state === 'connected') : true
    const now = new Date()
    const nowIso = now.toISOString()

    // Determina escopo (preserva o existente, senão assume 'company')
    const scope = (prev as any)?.scope || 'company'

    if (!isConnected) {
      const downSince = prev?.down_since ? new Date(prev.down_since) : now
      await supabase.from('instance_health').upsert({
        instance_name: inst.instance_name,
        scope,
        company_id: inst.company_id,
        last_state: state,
        last_seen_at: nowIso,
        down_since: downSince.toISOString(),
        down_alerted_at: (prev as any)?.down_alerted_at ?? null,
        recovered_alerted_at: null,
        next_reconnect_at: new Date(now.getTime() + 60_000).toISOString(),
      }, { onConflict: 'instance_name' })

      // Registra disconnected na primeira detecção da queda
      if (wasConnected || !prev) {
        await supabase.from('instance_events').insert({
          instance_name: inst.instance_name,
          scope,
          company_id: inst.company_id,
          event_type: 'disconnected',
          previous_state: prev?.last_state || null,
          new_state: state,
          down_since: downSince.toISOString(),
          metadata: { source: 'webhook', realtime: true },
        })
      }
    } else {
      const downtimeSeconds = prev?.down_since
        ? Math.round((now.getTime() - new Date(prev.down_since).getTime()) / 1000)
        : 0

      await supabase.from('instance_health').upsert({
        instance_name: inst.instance_name,
        scope,
        company_id: inst.company_id,
        last_state: state,
        last_seen_at: nowIso,
        down_since: null,
        recovered_alerted_at: (prev as any)?.down_alerted_at ? nowIso : null,
        reconnect_attempts: 0,
        next_reconnect_at: null,
        last_reconnect_error: null,
        reconnect_given_up: false,
      }, { onConflict: 'instance_name' })

      // Registra reconnected quando antes estava offline
      if (prev && !wasConnected) {
        await supabase.from('instance_events').insert({
          instance_name: inst.instance_name,
          scope,
          company_id: inst.company_id,
          event_type: 'reconnected',
          previous_state: prev.last_state,
          new_state: state,
          down_since: prev.down_since,
          duration_seconds: downtimeSeconds || null,
          metadata: { source: 'webhook', realtime: true },
        })
      }
    }

    await log(supabase, {
      company_id: inst.company_id,
      event: `evolution.connection.${dbStatus}`,
      provider: 'evolution',
      status: 'success',
      metadata: { state, db_status: dbStatus, phone: phoneFromJid, realtime: true },
    })
    return { ignored: `connection_update:${dbStatus}` }
  }

  // ============================================================
  // messages.update — ACKs (sent / delivered / read / played)
  // ============================================================
  if (eventName === 'messages.update') {
    const updates = Array.isArray(env.data) ? env.data : [env.data]
    const STATUS_MAP: Record<string, string> = {
      PENDING: 'pending', SERVER_ACK: 'sent', DELIVERY_ACK: 'delivered',
      READ: 'read', READ_SELF: 'read', PLAYED: 'played', PLAYED_SELF: 'played',
      ERROR: 'error', DELETED: 'error',
      '0': 'error', '1': 'pending', '2': 'sent', '3': 'delivered', '4': 'read', '5': 'played',
    }
    for (const u of (updates as Array<Record<string, unknown> | null>)) {
      if (!u) continue
      const k = (u.key ?? {}) as Record<string, unknown>
      const upd = (u.update ?? {}) as Record<string, unknown>
      const messageId =
        (typeof k.id === 'string' && k.id) ||
        (typeof u.keyId === 'string' && u.keyId) ||
        (typeof u.messageId === 'string' && u.messageId) ||
        (typeof u.id === 'string' && u.id) ||
        (typeof (upd.key as Record<string, unknown> | undefined)?.id === 'string' && (upd.key as Record<string, unknown>).id as string) ||
        null
      const rawStatus = upd.status ?? u.status ?? u.messageStatus
      if (!messageId || rawStatus == null) continue
      const newStatus = STATUS_MAP[String(rawStatus)] || STATUS_MAP[String(rawStatus).toUpperCase()] || null
      if (!newStatus) continue

      const { data: applied, error: ackErr } = await supabase.rpc('set_chat_message_status', {
        _message_id: messageId,
        _company_id: inst.company_id,
        _status: newStatus,
      })
      if (ackErr || applied === null) {
        try {
          await supabase.rpc('enqueue_webhook_retry', {
            _company_id: inst.company_id,
            _kind: 'status_update',
            _message_id: messageId,
            _provider: 'evolution',
            _payload: { message_id: messageId, status: newStatus },
            _initial_error: ackErr?.message ?? 'message_not_found_yet',
          })
        } catch (_) { /* ignore */ }
      }
    }
    await log(supabase, {
      company_id: inst.company_id,
      event: 'evolution.messages_update',
      provider: 'evolution',
      status: 'success',
      metadata: { count: updates.length },
    })
    return { ignored: 'status_processed' }
  }

  // ============================================================
  // messages.delete
  // ============================================================
  if (eventName === 'messages.delete') {
    const data = (env.data ?? {}) as Record<string, unknown>
    const key = (data.key ?? {}) as Record<string, unknown>
    const messageId = typeof key.id === 'string' ? key.id : null
    if (messageId) {
      await supabase
        .from('chat_messages')
        .delete()
        .eq('company_id', inst.company_id)
        .eq('message_id', messageId)
    }
    return { ignored: 'deleted' }
  }

  // ============================================================
  // presence.update — broadcast typing (sem persistência)
  // ============================================================
  if (eventName === 'presence.update') {
    try {
      const presenceData = (env.data ?? {}) as Record<string, unknown>
      const remoteJid =
        (typeof presenceData.remoteJid === 'string' && presenceData.remoteJid) ||
        (typeof presenceData.id === 'string' && presenceData.id) ||
        null
      const presences = (presenceData.presences ?? {}) as Record<string, { lastKnownPresence?: string }>
      const presenceStatus =
        (remoteJid && presences[remoteJid]?.lastKnownPresence) ||
        (typeof presenceData.presence === 'string' && presenceData.presence) ||
        (typeof presenceData.status === 'string' && presenceData.status) ||
        'unavailable'
      if (remoteJid) {
        // Resolve LID → telefone se necessário
        let channelJid: string = remoteJid
        if (remoteJid.endsWith('@lid')) {
          const { data: mapped } = await supabase
            .from('whatsapp_lid_map')
            .select('phone_jid')
            .eq('company_id', inst.company_id)
            .eq('lid', remoteJid)
            .maybeSingle()
          if (mapped?.phone_jid) channelJid = mapped.phone_jid
        }
        const basePayload = {
          remote_jid: channelJid,
          presence: presenceStatus,
          timestamp: new Date().toISOString(),
        }
        const ch1 = supabase.channel(`presence-${inst.company_id}-${channelJid}`)
        await ch1.send({ type: 'broadcast', event: 'typing', payload: basePayload })
        supabase.removeChannel(ch1)
        const ch2 = supabase.channel(`presence-${inst.company_id}`)
        await ch2.send({
          type: 'broadcast',
          event: 'typing',
          payload: { ...basePayload, original_jid: remoteJid },
        })
        supabase.removeChannel(ch2)
      }
    } catch (e) {
      console.warn('[evolutionHandler] presence broadcast failed:', (e as Error)?.message)
    }
    return { ignored: 'presence_broadcast' }
  }

  // Demais eventos não-mensagem
  if (eventName !== 'messages.upsert') {
    await log(supabase, {
      company_id: inst.company_id,
      event: `evolution.${eventName || 'unknown'}`,
      provider: 'evolution',
      status: 'success',
      metadata: { skipped: true },
    })
    return { ignored: `unsupported_event:${eventName}` }
  }

  const data = (env.data ?? {}) as Record<string, unknown>
  const key = (data.key ?? {}) as Record<string, unknown>
  const message = (data.message ?? {}) as Record<string, unknown>
  const remoteJidRaw = typeof key.remoteJid === 'string' ? key.remoteJid : ''
  const fromMe = Boolean(key.fromMe)
  const messageId = typeof key.id === 'string' ? key.id : null
  const pushName = typeof data.pushName === 'string' ? data.pushName.slice(0, 120) : null
  const tsSec = Number(data.messageTimestamp) || Math.floor(Date.now() / 1000)
  const timestamp = new Date(tsSec * 1000).toISOString()

  if (!messageId || !remoteJidRaw) {
    await log(supabase, {
      company_id: inst.company_id,
      event: 'evolution.bad_payload',
      provider: 'evolution',
      status: 'warning',
      error_message: 'message.id ou remoteJid ausente',
    })
    return { ignored: 'bad_payload' }
  }

  // ── Reaction message: atualiza reaction_emoji da mensagem alvo e retorna ──
  const reactionMsg = message.reactionMessage as
    | { text?: string; key?: { id?: string; stanzaId?: string } }
    | undefined
  if (reactionMsg) {
    const targetId = reactionMsg.key?.id || reactionMsg.key?.stanzaId || null
    const emoji = typeof reactionMsg.text === 'string' ? reactionMsg.text.slice(0, 16) : null
    if (targetId) {
      await supabase
        .from('chat_messages')
        .update({ reaction_emoji: emoji })
        .eq('company_id', inst.company_id)
        .eq('message_id', targetId)
    }
    await log(supabase, {
      company_id: inst.company_id,
      event: 'evolution.reaction_update',
      provider: 'evolution',
      status: 'success',
      metadata: { target_message_id: targetId, reaction: emoji, from_me: fromMe },
    })
    return { ignored: 'reaction' }
  }

  const phone = normalizeJid(remoteJidRaw)
  const detected = detectMessageType(message)

  // ── LID → phone mapping (para resolver presence.update de grupos depois) ──
  if (!fromMe) {
    try {
      const senderLid =
        (typeof (key as Record<string, unknown>).senderLid === 'string' && (key as Record<string, unknown>).senderLid as string) ||
        (typeof (key as Record<string, unknown>).participantLid === 'string' && (key as Record<string, unknown>).participantLid as string) ||
        (typeof (key as Record<string, unknown>).participantAlt === 'string' && (key as Record<string, unknown>).participantAlt as string) ||
        null
      if (senderLid && senderLid.endsWith('@lid') && remoteJidRaw.endsWith('@s.whatsapp.net')) {
        await supabase.from('whatsapp_lid_map').upsert({
          company_id: inst.company_id,
          lid: senderLid,
          phone_jid: remoteJidRaw,
          instance_name: inst.instance_name,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'company_id,lid' })
      }
    } catch (e) {
      console.warn('[evolutionHandler] lid map upsert failed:', (e as Error)?.message)
    }
  }

  // Upsert conversation — contact_name só vem de mensagens inbound (fromMe=true
  // traz o nome do operador e contaminaria o cadastro do lead).
  const convPayload: Record<string, unknown> = {
    company_id: inst.company_id,
    instance_name: inst.instance_name,
    instance_id: inst.id,
    provider: 'evolution',
    remote_jid: phone,
    phone,
    last_message_text: detected.type === 'interactive'
      ? (detected.content || '🔘 Mensagem interativa')
      : (detected.content?.slice(0, 200) ?? null),
    last_message_at: timestamp,
  }
  if (!fromMe && pushName) {
    convPayload.contact_name = pushName
  }

  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .upsert(convPayload, { onConflict: 'company_id,instance_name,remote_jid' })
    .select('id')
    .maybeSingle()

  if (convErr || !conv) {
    await log(supabase, {
      company_id: inst.company_id,
      event: 'evolution.conversation_upsert',
      provider: 'evolution',
      status: 'error',
      error_message: convErr?.message ?? 'sem retorno',
    })
    return { ignored: 'conversation_failed' }
  }

  // Incrementa unread_count atomicamente em mensagens inbound (evita race com markRead)
  if (!fromMe) {
    await supabase.rpc('bump_conversation_unread', { _conversation_id: conv.id })
  }



  // Upsert chat_message (idempotente por message_id)
  const { data: msg, error: msgErr } = await supabase
    .from('chat_messages')
    .upsert(
      [{
        company_id: inst.company_id,
        conversation_id: conv.id,
        remote_jid: phone,
        message_id: messageId,
        provider: 'evolution',
        provider_message_id: messageId,
        provider_raw_payload: env,
        webhook_received_at: new Date().toISOString(),
        from_me: fromMe,
        message_type: detected.type,
        content: detected.content,
        media_url: detected.mediaUrl,
        media_mimetype: detected.mediaMime,
        file_name: detected.fileName,
        duration: detected.duration,
        link_preview: detected.linkPreview,
        sender_name: fromMe ? null : pushName,
        status: fromMe ? 'sent' : 'received',
        timestamp,
      }],
      { onConflict: 'company_id,message_id' },
    )
    .select('id')
    .maybeSingle()

  if (msgErr || !msg) {
    await log(supabase, {
      company_id: inst.company_id,
      conversation_id: conv.id,
      event: 'evolution.message_upsert',
      provider: 'evolution',
      status: 'error',
      error_message: msgErr?.message ?? 'sem retorno',
    })
    return { ignored: 'message_failed' }
  }

  await log(supabase, {
    company_id: inst.company_id,
    conversation_id: conv.id,
    event: 'evolution.persisted',
    provider: 'evolution',
    status: 'success',
    metadata: { chat_message_id: msg.id, message_type: detected.type, provider_message_id: messageId },
  })

  return { messageId: msg.id }

}
