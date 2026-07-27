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
  // Grupos preservam sufixo @g.us
  if (/@g\.us$/i.test(jid)) {
    const d = jid.replace(/@g\.us$/i, '').replace(/\D/g, '')
    return d ? `${d}@g.us` : ''
  }
  let digits = jid
    .replace(/@s\.whatsapp\.net$/i, '')
    .replace(/@c\.us$/i, '')
    .replace(/\D/g, '')
  if (!digits) return ''
  // BR: celular com 13 dígitos (55 + DDD + 9XXXXXXXX) → remove o 9
  if (digits.length === 13 && digits.startsWith('55') && digits[4] === '9') {
    digits = digits.slice(0, 4) + digits.slice(5)
  }
  return digits
}

function detectMessageType(message: Record<string, unknown>): {
  type:
    | 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker'
    | 'location' | 'contact' | 'reaction' | 'interactive' | 'unknown'
  content: string | null
  mediaUrl: string | null
  mediaMime: string | null
  fileName: string | null
  duration: number | null
} {
  const get = (k: string) => message[k] as Record<string, unknown> | undefined

  if (typeof message.conversation === 'string') {
    return { type: 'text', content: message.conversation, mediaUrl: null, mediaMime: null, fileName: null, duration: null }
  }
  if (get('extendedTextMessage')) {
    return { type: 'text', content: pickString(get('extendedTextMessage'), 'text'), mediaUrl: null, mediaMime: null, fileName: null, duration: null }
  }
  if (get('imageMessage')) {
    const m = get('imageMessage')!
    return { type: 'image', content: pickString(m, 'caption'), mediaUrl: pickString(m, 'url'), mediaMime: pickString(m, 'mimetype'), fileName: null, duration: null }
  }
  if (get('videoMessage')) {
    const m = get('videoMessage')!
    return { type: 'video', content: pickString(m, 'caption'), mediaUrl: pickString(m, 'url'), mediaMime: pickString(m, 'mimetype'), fileName: null, duration: Number(m.seconds) || null }
  }
  if (get('audioMessage')) {
    const m = get('audioMessage')!
    return { type: 'audio', content: null, mediaUrl: pickString(m, 'url'), mediaMime: pickString(m, 'mimetype'), fileName: null, duration: Number(m.seconds) || null }
  }
  if (get('documentMessage')) {
    const m = get('documentMessage')!
    return { type: 'document', content: pickString(m, 'caption'), mediaUrl: pickString(m, 'url'), mediaMime: pickString(m, 'mimetype'), fileName: pickString(m, 'fileName'), duration: null }
  }
  if (get('stickerMessage')) {
    const m = get('stickerMessage')!
    return { type: 'sticker', content: null, mediaUrl: pickString(m, 'url'), mediaMime: pickString(m, 'mimetype'), fileName: null, duration: null }
  }
  if (get('locationMessage')) {
    return { type: 'location', content: '[location]', mediaUrl: null, mediaMime: null, fileName: null, duration: null }
  }
  if (get('contactMessage') || get('contactsArrayMessage')) {
    return { type: 'contact', content: '[contact]', mediaUrl: null, mediaMime: null, fileName: null, duration: null }
  }
  if (get('reactionMessage')) {
    return { type: 'reaction', content: pickString(get('reactionMessage'), 'text'), mediaUrl: null, mediaMime: null, fileName: null, duration: null }
  }
  if (get('buttonsResponseMessage') || get('listResponseMessage') || get('templateButtonReplyMessage')) {
    return { type: 'interactive', content: null, mediaUrl: null, mediaMime: null, fileName: null, duration: null }
  }
  return { type: 'unknown', content: null, mediaUrl: null, mediaMime: null, fileName: null, duration: null }
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

  // Apenas eventos de mensagem nos interessam aqui.
  if (eventName !== 'messages.upsert' && eventName !== 'messages.update') {
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

  const phone = normalizeJid(remoteJidRaw)
  const detected = detectMessageType(message)

  // Upsert conversation
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .upsert(
      {
        company_id: inst.company_id,
        instance_name: inst.instance_name,
        instance_id: inst.id,
        provider: 'evolution',
        remote_jid: phone,
        phone,
        last_message_text: detected.content,
        last_message_at: timestamp,
      },
      { onConflict: 'company_id,instance_name,remote_jid' },
    )
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
