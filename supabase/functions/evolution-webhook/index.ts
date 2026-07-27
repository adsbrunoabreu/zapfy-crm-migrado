import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Decode base64 string to Uint8Array in chunks to avoid engine limits on larger media
function base64Decode(b64: string): Uint8Array {
  const clean = b64.replace(/\s/g, '')
  const chunkSize = 32_768
  const chunks: Uint8Array[] = []
  let totalLength = 0

  for (let i = 0; i < clean.length; i += chunkSize) {
    const binStr = atob(clean.slice(i, i + chunkSize))
    const chunk = new Uint8Array(binStr.length)
    for (let j = 0; j < binStr.length; j++) {
      chunk[j] = binStr.charCodeAt(j)
    }
    chunks.push(chunk)
    totalLength += chunk.length
  }

  const bytes = new Uint8Array(totalLength)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }
  return bytes
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Lightweight logger that writes to system_logs table
function createLogger(supabase: any, companyId: string, instanceName: string) {
  return async (level: string, event: string, message: string, metadata?: Record<string, unknown>) => {
    try {
      await supabase.from('system_logs').insert({
        company_id: companyId,
        source: 'evolution-webhook',
        level,
        event,
        message,
        instance_name: instanceName,
        metadata: metadata || {},
      })
    } catch (e) {
      console.error('[Logger] Failed to write log:', e)
    }
  }
}

// Cache (TTL 60s) dos números próprios da empresa para detectar "echo"
// quando o mesmo WhatsApp está conectado em mais de uma instância/provider.
const ownNumbersCache = new Map<string, { numbers: Set<string>; expiresAt: number }>()
const OWN_NUMBERS_TTL_MS = 60_000

function normalizePhoneDigits(p: string | null | undefined): string {
  return (p || '').replace(/\D/g, '')
}

async function getCompanyOwnNumbers(supabase: any, companyId: string): Promise<Set<string>> {
  const cached = ownNumbersCache.get(companyId)
  if (cached && cached.expiresAt > Date.now()) return cached.numbers

  const { data } = await supabase
    .from('whatsapp_instances')
    .select('phone_number, config')
    .eq('company_id', companyId)
    .eq('is_active', true)

  const numbers = new Set<string>()
  for (const row of (data ?? []) as Array<{ phone_number: string | null; config: Record<string, unknown> | null }>) {
    const direct = normalizePhoneDigits(row.phone_number)
    if (direct) numbers.add(direct)
    const cfgPhone = normalizePhoneDigits((row.config ?? {})?.phoneNumber as string | undefined)
    if (cfgPhone) numbers.add(cfgPhone)
  }
  ownNumbersCache.set(companyId, { numbers, expiresAt: Date.now() + OWN_NUMBERS_TTL_MS })
  return numbers
}

// Get file extension from mimetype
function getExtFromMime(mime: string): string {
  const map: Record<string, string> = {
    'audio/ogg; codecs=opus': 'ogg',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/webm': 'webm',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  }
  return map[mime] || mime.split('/')[1]?.split(';')[0] || 'bin'
}

function normalizeEventName(event: string): string {
  return (event || '').toLowerCase().replace(/_/g, '.')
}

// Sanitize free-text from external webhook to prevent control-char injection
// and oversized payloads that could break DB columns/UI.
function sanitizeText(value: unknown, maxLen = 4096): string {
  if (value == null) return ''
  const str = typeof value === 'string' ? value : String(value)
  // Strip C0/C1 control characters except tab/newline/CR
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, maxLen)
}

function sanitizeShort(value: unknown, maxLen = 255): string | null {
  if (value == null) return null
  const cleaned = sanitizeText(value, maxLen).trim()
  return cleaned || null
}

function isValidHttpUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length > 2048) return false
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

// Normalize Evolution URL (same logic as proxy)
function normalizeEvolutionUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
}

function buildEvolutionCandidates(configuredUrl: string): string[] {
  if (!configuredUrl) return []
  const candidates: string[] = []
  try {
    const parsed = new URL(configuredUrl)
    if (parsed.hostname.startsWith('easypanel.')) {
      const apiUrl = new URL(configuredUrl)
      apiUrl.hostname = parsed.hostname.replace(/^easypanel\./, 'evoapi.')
      candidates.push(apiUrl.toString().replace(/\/+$/, ''))
    }
  } catch { /* ignore */ }
  candidates.push(configuredUrl)
  return [...new Set(candidates)]
}

// Download media from Evolution API and upload to Supabase Storage
async function downloadAndStoreMedia(
  supabase: any,
  instanceName: string,
  messageId: string,
  companyId: string,
  mediaType: string,
  mimetype: string | null,
  log: (level: string, event: string, message: string, metadata?: Record<string, unknown>) => Promise<void>,
): Promise<{ url: string | null; path: string } | null> {
  const evolutionUrlRaw =
    Deno.env.get('EVOLUTION_MASTER_URL') ||
    Deno.env.get('EVOLUTION_API_URL') ||
    ''
  const configuredUrl = normalizeEvolutionUrl(evolutionUrlRaw)
  const evolutionKey =
    Deno.env.get('EVOLUTION_MASTER_API_KEY') ||
    Deno.env.get('EVOLUTION_API_KEY') ||
    ''

  if (!configuredUrl || !evolutionKey) {
    await log('warn', 'media_download', 'Evolution API não configurada para download de mídia')
    return null
  }

  const candidates = buildEvolutionCandidates(configuredUrl)
  const headers = { 'Content-Type': 'application/json', 'apikey': evolutionKey }

  try {
    let response: Response | null = null
    let lastError = ''

    // Try each candidate URL
    for (const baseUrl of candidates) {
      const url = `${baseUrl}/chat/getBase64FromMediaMessage/${instanceName}`
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            message: { key: { id: messageId } },
            convertToMp4: mediaType === 'video',
          }),
          signal: AbortSignal.timeout(30000),
        })
        if (response.ok) {
          await log('info', 'media_download', `Mídia baixada via ${baseUrl}`, { messageId })
          break
        }
        lastError = await response.text()
        response = null // try next candidate
      } catch (e) {
        lastError = String(e)
      }
    }

    if (!response || !response.ok) {
      await log('error', 'media_download', `Falha ao baixar mídia de todos os candidatos`, { messageId, error: lastError.substring(0, 300), candidates })
      return null
    }

    const result = await response.json()
    const base64Data = result?.base64 || result?.data || null

    if (!base64Data) {
      await log('warn', 'media_download', 'Resposta sem dados base64', { messageId })
      return null
    }

    // Clean base64 (remove data:... prefix if present)
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '')
    const fileBytes = base64Decode(cleanBase64)
    const ext = getExtFromMime(mimetype || '')
    const storagePath = `${companyId}/${mediaType}/${messageId}.${ext}`

    // Normaliza content-type para o Storage (remove parâmetros como
    // `; codecs=opus` que Safari/Edge rejeitam ao decodificar via <audio>).
    const normalizedContentType = (mimetype || 'application/octet-stream').split(';')[0].trim()

    // Upload to chat-media bucket
    const { error: uploadError } = await supabase.storage
      .from('chat-media')
      .upload(storagePath, fileBytes, {
        contentType: normalizedContentType,
        upsert: true,
      })

    if (uploadError) {
      await log('error', 'media_upload', `Falha ao fazer upload: ${uploadError.message}`, { messageId, storagePath })
      return null
    }

    await log('info', 'media_stored', `Mídia ${mediaType} armazenada`, { messageId, storagePath })

    // Cliente gera signed URL fresca via getChatMediaUrl(storagePath); NÃO
    // persistir signed URL em chat_messages.media_url (expira em 7d e quebra
    // o player). Retornamos apenas o path.
    return { url: null, path: storagePath } as any
  } catch (e) {
    await log('error', 'media_download', `Erro ao processar mídia: ${String(e)}`, { messageId })
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // ── S1: Validação OBRIGATÓRIA de origem do webhook ──
  // Aceita EVOLUTION_WEBHOOK_SECRET (preferencial) ou EVOLUTION_MASTER_API_KEY como fallback,
  // já que a Evolution API permite configurar apikey de envio do webhook.
  const WEBHOOK_SECRET =
    Deno.env.get('EVOLUTION_WEBHOOK_SECRET') ||
    Deno.env.get('EVOLUTION_MASTER_API_KEY') ||
    ''

  if (!WEBHOOK_SECRET) {
    console.error('[WEBHOOK] Nenhum secret configurado — rejeitando todas as requisições')
    return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const incomingApiKey =
    req.headers.get('apikey') ??
    req.headers.get('x-api-key') ??
    req.headers.get('authorization')?.replace('Bearer ', '')

  if (!incomingApiKey || incomingApiKey !== WEBHOOK_SECRET) {
    const mask = (v: string | null | undefined) =>
      !v ? '<empty>' : v.length <= 6 ? `${v[0]}***` : `${v.slice(0, 3)}…${v.slice(-3)}(len=${v.length})`
    console.warn('[WEBHOOK] Requisição rejeitada — apikey inválida:', {
      ip: req.headers.get('x-forwarded-for'),
      ua: req.headers.get('user-agent'),
      received: mask(incomingApiKey),
      expected: mask(WEBHOOK_SECRET),
      timestamp: new Date().toISOString(),
    })
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let payload: any
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const event = payload.event as string
  const normalizedEvent = normalizeEventName(event)
  const instance = payload.instance as string

  // ────────────────────────────────────────────────────────────────────
  // ASYNC FAST-PATH (opt-in por env var ou flag por instância)
  // Quando ativo, este endpoint vira "thin": apenas insere o payload em
  // webhook_inbox e responde 200 imediatamente. Todo o processamento
  // (persistência, ACKs, IA, automações, mídia) roda no worker
  // `process-webhook-inbox` → `evolutionHandler`.
  // Crítérios de ativação (ordem de prioridade):
  //   1) Env var EVOLUTION_ASYNC_ALL=true → todas as instâncias async
  //   2) whatsapp_instances.config.asyncWebhook=true → opt-in por instância
  // ────────────────────────────────────────────────────────────────────
  const ASYNC_ALL = Deno.env.get('EVOLUTION_ASYNC_ALL') === 'true'
  let asyncMode = ASYNC_ALL
  if (!asyncMode && instance) {
    try {
      const { data: instCfg } = await supabase
        .from('whatsapp_instances')
        .select('config')
        .eq('provider', 'evolution')
        .eq('instance_name', instance)
        .maybeSingle()
      const cfgFlag = (instCfg?.config as Record<string, unknown> | null)?.asyncWebhook
      if (cfgFlag === true || cfgFlag === 'true') asyncMode = true
    } catch (_) {
      // Em caso de erro lendo a instância, mantém legacy mode (mais seguro)
    }
  }

  if (asyncMode) {
    try {
      // Captura headers relevantes
      const headersObj: Record<string, string> = {}
      for (const [k, v] of req.headers.entries()) {
        const lk = k.toLowerCase()
        if (
          lk === 'apikey' || lk === 'x-evolution-apikey' || lk === 'x-api-key' ||
          lk === 'content-type' || lk === 'user-agent'
        ) {
          headersObj[lk] = v
        }
      }
      // Garantir que o worker valide a apikey contra config.apiKey
      if (!headersObj['apikey'] && incomingApiKey) {
        headersObj['apikey'] = incomingApiKey
      }

      const rawBody = JSON.stringify(payload)
      const { error: inboxErr } = await supabase.from('webhook_inbox').insert({
        provider: 'evolution',
        event_type: normalizedEvent || null,
        instance_name: instance || null,
        payload: { ...payload, _raw_body: rawBody },
        headers: headersObj,
      })
      if (inboxErr) {
        console.error('[evolution-webhook][async] inbox insert failed:', inboxErr.message)
        // Devolve 5xx para o provider tentar de novo
        return new Response(
          JSON.stringify({ error: 'inbox_insert_failed', detail: inboxErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      // Fire-and-forget invoca o worker (reduz latência de até 60s do cron)
      try {
        void supabase.functions.invoke('process-webhook-inbox', { body: { trigger: 'evolution-webhook' } })
          .catch((e) => console.error('[evolution-webhook][async] worker invoke failed:', e?.message))
      } catch (e) {
        console.error('[evolution-webhook][async] worker dispatch error:', (e as Error)?.message)
      }

      return new Response(
        JSON.stringify({ ok: true, queued: true, mode: 'async' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    } catch (err) {
      console.error('[evolution-webhook][async] unexpected:', (err as Error)?.message)
      return new Response(
        JSON.stringify({ error: 'internal_error', detail: (err as Error)?.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
  }

  // ── Early handling: presence.update precisa fazer broadcast (typing) sem persistir ──
  if (normalizedEvent === 'presence.update') {
    console.log('[Webhook] presence.update raw payload:', JSON.stringify((payload as any).data || {}).substring(0, 500))
    try {
      const presenceData: any = (payload as any).data
      const remoteJid = presenceData?.remoteJid || presenceData?.id
      const presenceStatus = (remoteJid && presenceData?.presences?.[remoteJid]?.lastKnownPresence)
        || presenceData?.presence || presenceData?.status || 'unavailable'

      if (remoteJid && instance) {
        // Resolver company_id pela instância (sem depender do fluxo principal)
        const { data: inst } = await supabase
          .from('whatsapp_instances')
          .select('company_id')
          .eq('instance_name', instance)
          .maybeSingle()

        const companyId = inst?.company_id
        if (companyId) {
          const ts = new Date().toISOString()

          // Se o JID veio como @lid, tenta resolver para o JID telefônico
          // usando o mapeamento populado em messages.upsert.
          let phoneJid: string | null = null
          if (remoteJid.endsWith('@lid')) {
            const { data: mapped } = await supabase
              .from('whatsapp_lid_map')
              .select('phone_jid')
              .eq('company_id', companyId)
              .eq('lid', remoteJid)
              .maybeSingle()
            phoneJid = mapped?.phone_jid || null
          }

          const channelJid = phoneJid || remoteJid
          const basePayload = {
            remote_jid: channelJid,
            presence: presenceStatus,
            timestamp: ts,
          }

          // 1) Canal específico do JID resolvido (telefone quando possível).
          const ch1 = supabase.channel(`presence-${companyId}-${channelJid}`)
          await ch1.send({ type: 'broadcast', event: 'typing', payload: basePayload })
          supabase.removeChannel(ch1)

          // 2) Canal "wildcard" da empresa: fallback para casos onde o LID
          //    ainda não foi mapeado (primeira interação).
          const ch2 = supabase.channel(`presence-${companyId}`)
          await ch2.send({
            type: 'broadcast',
            event: 'typing',
            payload: { ...basePayload, original_jid: remoteJid },
          })
          supabase.removeChannel(ch2)
        }
      }
    } catch (e) {
      console.warn('[Webhook] presence.update broadcast failed:', e)
    }
    return new Response(JSON.stringify({ ok: true, presence: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Early return: outros eventos de alta frequência sem valor de persistência ──
  const NOISY_EVENTS = new Set([
    'chats.update',
    'chats.upsert',
    'contacts.update',
    'contacts.upsert',
  ])
  if (NOISY_EVENTS.has(normalizedEvent)) {
    return new Response(JSON.stringify({ ok: true, skipped: normalizedEvent }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ACK imediato para a Evolution e processa em background — evita reenvio por timeout.
  const processing = (async () => {
   try {
    console.log(`[Webhook] Event: ${event}, Normalized: ${normalizedEvent}, Instance: ${instance}`)

    // Dynamically resolve company_id from whatsapp_instances table
    const { data: instanceData } = await supabase
      .from('whatsapp_instances')
      .select('id, company_id')
      .eq('instance_name', instance)
      .maybeSingle()

    if (!instanceData) {
      console.log(`[Webhook] No registered instance found for: ${instance}`)
      await supabase.from('system_logs').insert({
        source: 'evolution-webhook',
        level: 'warn',
        event: 'unknown_instance',
        message: `Instância não registrada: ${instance}`,
        instance_name: instance,
        metadata: { event, normalized_event: normalizedEvent },
      })
      return
    }

    const resolvedCompanyId = instanceData.company_id
    const resolvedInstanceId = instanceData.id
    const log = createLogger(supabase, resolvedCompanyId, instance)

    // ── Auditoria de webhook (sempre) ──
    // Grava o payload bruto em webhook_audit (1 linha por evento recebido).
    // Truncado se exceder ~200KB para proteger a coluna jsonb.
    try {
      const raw = JSON.stringify(payload)
      const tooBig = raw.length > 200_000
      const safeBody = tooBig
        ? { _truncated: true, _size_bytes: raw.length, preview: raw.slice(0, 200_000) }
        : payload
      await supabase.from('webhook_audit').insert({
        company_id: resolvedCompanyId,
        instance_id: resolvedInstanceId,
        instance_name: instance,
        provider: 'evolution',
        event_type: event,
        normalized_event: normalizedEvent,
        status: 'received',
        raw_body: safeBody,
      })
    } catch (e) {
      console.warn('[evolution-webhook] webhook_audit insert failed:', (e as Error)?.message)
    }

    switch (normalizedEvent) {
      case 'messages.upsert':
      case 'send.message': {
        const data = payload.data
        if (!data?.key) {
          await log('warn', 'messages.upsert', 'Payload sem key, ignorado', { raw_keys: Object.keys(data || {}) })
          break
        }

        const remoteJid = sanitizeShort(data.key.remoteJid, 128) || ''
        const fromMe = !!data.key.fromMe
        const messageId = sanitizeShort(data.key.id, 128) || ''
        const pushName = sanitizeShort(data.pushName, 150) || ''
        const messageTimestamp = data.messageTimestamp as number
        const message = data.message || {}

        if (!remoteJid || !messageId) {
          await log('warn', 'messages.upsert', 'Payload sem identificadores válidos, ignorado')
          break
        }

        // Skip status messages and group messages
        if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast') break

        const phoneRaw = remoteJid.replace('@s.whatsapp.net', '').replace(/\D/g, '')
        if (phoneRaw.length < 8 || phoneRaw.length > 20) {
          await log('warn', 'messages.upsert', 'Telefone inválido, ignorado', { remote_jid: remoteJid })
          break
        }
        const phone = phoneRaw

        // Bloqueio de eco: se a mensagem é "recebida" (fromMe=false) mas o
        // número de origem pertence à própria empresa (mesmo WhatsApp também
        // conectado em outra instância/provider, ex.: Cloud API), descarta
        // para não duplicar conversa no chatlist.
        if (!fromMe) {
          try {
            const ownNumbers = await getCompanyOwnNumbers(supabase, resolvedCompanyId)
            if (ownNumbers.has(phone)) {
              await log('warn', 'evolution.echo_skipped', 'Mensagem ecoada de outra instância da mesma empresa — ignorada', {
                from: phone, message_id: messageId, instance_name: instance,
              })
              break
            }
          } catch (e) {
            console.error('[evolution-webhook] echo check failed:', (e as Error)?.message)
          }
        }

        // Determine message content
        let content = ''
        let mediaUrl: string | null = null
        let mediaMimetype: string | null = null
        let fileName: string | null = null
        let duration: number | null = null
        let latitude: number | null = null
        let longitude: number | null = null
        let quotedMessageId: string | null = null
        let reactionEmoji: string | null = null
        let linkPreview: any = null
        let type = 'text'

        // ============================================
        // EDIÇÃO DE MENSAGEM (protocolMessage type 14 ou message.editedMessage)
        // ============================================
        const editProto = (message as any)?.protocolMessage?.type === 14
          ? (message as any).protocolMessage
          : null
        const editedInner =
          editProto?.editedMessage ||
          (message as any)?.editedMessage?.message ||
          (message as any)?.editedMessage ||
          null
        if (editedInner) {
          const targetId = sanitizeShort(editProto?.key?.id || data.key.id, 128)
          const newText = sanitizeText(
            editedInner.conversation
              ?? editedInner.extendedTextMessage?.text
              ?? ''
          )
          if (targetId && newText) {
            const { error: editErr } = await supabase
              .from('chat_messages')
              .update({ content: newText, edited_at: new Date().toISOString() })
              .eq('company_id', resolvedCompanyId)
              .eq('message_id', targetId)
            if (editErr) {
              await log('error', 'message_edit', `Falha ao aplicar edição: ${editErr.message}`, { message_id: targetId })
            } else {
              await log('info', 'message_edit', 'Mensagem editada via WhatsApp', { message_id: targetId, from_me: fromMe })
            }
          } else {
            await log('warn', 'message_edit', 'Edição recebida sem messageId/texto válido', { message_id: targetId })
          }
          break
        }

        if (message.conversation) {
          content = sanitizeText(message.conversation)
          type = 'text'
        } else if (message.extendedTextMessage) {
          content = sanitizeText(message.extendedTextMessage.text)
          type = 'text'
          if (message.extendedTextMessage.contextInfo?.quotedMessage) {
            quotedMessageId = sanitizeShort(message.extendedTextMessage.contextInfo?.stanzaId, 128)
          }
        } else if (message.imageMessage) {
          type = 'image'
          mediaUrl = isValidHttpUrl(message.imageMessage.url) ? message.imageMessage.url : null
          mediaMimetype = sanitizeShort(message.imageMessage.mimetype, 100)
          content = sanitizeText(message.imageMessage.caption)
        } else if (message.audioMessage) {
          type = 'audio'
          mediaUrl = isValidHttpUrl(message.audioMessage.url) ? message.audioMessage.url : null
          mediaMimetype = sanitizeShort(message.audioMessage.mimetype, 100)
          duration = Number.isFinite(message.audioMessage.seconds) ? message.audioMessage.seconds : null
        } else if (message.videoMessage) {
          type = 'video'
          mediaUrl = isValidHttpUrl(message.videoMessage.url) ? message.videoMessage.url : null
          mediaMimetype = sanitizeShort(message.videoMessage.mimetype, 100)
          content = sanitizeText(message.videoMessage.caption)
          duration = Number.isFinite(message.videoMessage.seconds) ? message.videoMessage.seconds : null
        } else if (message.documentMessage) {
          type = 'document'
          mediaUrl = isValidHttpUrl(message.documentMessage.url) ? message.documentMessage.url : null
          mediaMimetype = sanitizeShort(message.documentMessage.mimetype, 100)
          fileName = sanitizeShort(message.documentMessage.fileName || message.documentMessage.title, 255)
        } else if (message.stickerMessage) {
          type = 'sticker'
          mediaUrl = isValidHttpUrl(message.stickerMessage.url) ? message.stickerMessage.url : null
          mediaMimetype = sanitizeShort(message.stickerMessage.mimetype, 100)
        } else if (message.locationMessage) {
          type = 'location'
          const lat = Number(message.locationMessage.degreesLatitude)
          const lng = Number(message.locationMessage.degreesLongitude)
          latitude = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null
          longitude = Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null
          content = sanitizeText(message.locationMessage.name || message.locationMessage.address, 500)
        } else if (message.reactionMessage) {
          type = 'reaction'
          reactionEmoji = sanitizeShort(message.reactionMessage.text, 16)
          const targetMessageId = sanitizeShort(message.reactionMessage.key?.id || message.reactionMessage?.key?.stanzaId, 128)

          if (targetMessageId) {
            const { error: reactionErr } = await supabase
              .from('chat_messages')
              .update({ reaction_emoji: reactionEmoji })
              .eq('message_id', targetMessageId)
              .eq('company_id', resolvedCompanyId)

            if (reactionErr) {
              await log('error', 'reaction_update', `Falha ao atualizar reação: ${reactionErr.message}`, { message_id: targetMessageId, reaction: reactionEmoji })
            } else {
              await log('info', 'reaction_update', 'Reação sincronizada', { message_id: targetMessageId, reaction: reactionEmoji, from_me: fromMe, source_event: normalizedEvent })
            }
          } else {
            await log('warn', 'reaction_update', 'Reação recebida sem mensagem alvo', { reaction: reactionEmoji })
          }
          break
        }
        // ============================================
        // MENSAGENS INTERATIVAS (templates / botões / listas)
        // ============================================
        else if (message.templateMessage) {
          type = 'interactive'
          const tpl = message.templateMessage.hydratedTemplate
                   ?? message.templateMessage.interactiveMessageTemplate
          if (!tpl) {
            content = '[Mensagem de template]'
          } else {
            content = sanitizeText(
              tpl.hydratedContentText
              ?? tpl.body?.text
              ?? '[Mensagem de template]'
            )
            const rawButtons = tpl.nativeFlowMessage?.buttons
              ?? tpl.hydratedButtons
            if (Array.isArray(rawButtons) && rawButtons.length > 0) {
              const buttons = rawButtons.map((btn: any) => {
                // hydratedButtons: tem urlButton/quickReplyButton/callButton
                if (btn.urlButton) {
                  return { type: 'cta_url', display_text: sanitizeShort(btn.urlButton.displayText, 80) || 'Abrir link', url: sanitizeShort(btn.urlButton.url, 500), id: null }
                }
                if (btn.quickReplyButton) {
                  return { type: 'quick_reply', display_text: sanitizeShort(btn.quickReplyButton.displayText, 80) || 'Responder', url: null, id: sanitizeShort(btn.quickReplyButton.id, 128) }
                }
                if (btn.callButton) {
                  return { type: 'call', display_text: sanitizeShort(btn.callButton.displayText, 80) || 'Ligar', url: null, id: sanitizeShort(btn.callButton.phoneNumber, 32) }
                }
                // nativeFlowMessage: name + buttonParamsJson
                try {
                  const params = JSON.parse(btn.buttonParamsJson || '{}')
                  return {
                    type: btn.name || 'button',
                    display_text: sanitizeShort(params.display_text || params.text || 'Clique aqui', 80),
                    url: sanitizeShort(params.url || null, 500),
                    id: sanitizeShort(params.id || null, 128),
                  }
                } catch {
                  return { type: btn.name || 'button', display_text: 'Botão', url: null, id: null }
                }
              })
              linkPreview = { type: 'buttons', buttons }
            }
          }
        } else if (message.buttonsMessage) {
          type = 'interactive'
          content = sanitizeText(message.buttonsMessage.contentText || '[Mensagem com botões]')
          if (Array.isArray(message.buttonsMessage.buttons)) {
            const buttons = message.buttonsMessage.buttons.map((btn: any) => {
              if (btn.urlButton) {
                return {
                  type: 'cta_url',
                  display_text: sanitizeShort(btn.urlButton.displayText || 'Abrir link', 80),
                  url: sanitizeShort(btn.urlButton.url, 500),
                  id: null,
                }
              }
              if (btn.callButton) {
                return {
                  type: 'phone_number',
                  display_text: sanitizeShort(btn.callButton.displayText || 'Ligar', 80),
                  phone_number: sanitizeShort(btn.callButton.phoneNumber, 32),
                  url: null,
                  id: null,
                }
              }
              if (btn.copyButton || btn.copyCodeButton) {
                const cb = btn.copyButton || btn.copyCodeButton
                return {
                  type: 'copy_code',
                  display_text: sanitizeShort(cb.copyCodeText || cb.displayText || 'Copiar', 80),
                  url: null,
                  id: null,
                }
              }
              return {
                type: 'quick_reply',
                display_text: sanitizeShort(btn.buttonText?.displayText || 'Botão', 80),
                url: null,
                id: sanitizeShort(btn.buttonId || '', 128),
              }
            })
            linkPreview = { type: 'buttons', buttons }
          }
        } else if (message.listMessage) {
          type = 'interactive'
          content = sanitizeText(
            message.listMessage.description
            ?? message.listMessage.title
            ?? '[Selecione uma opção]'
          )
          const options: any[] = []
          if (Array.isArray(message.listMessage.sections)) {
            for (const section of message.listMessage.sections) {
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
          linkPreview = {
            type: 'list',
            button_text: sanitizeShort(message.listMessage.buttonText, 80) || 'Ver opções',
            options,
          }
        } else if (message.interactiveMessage) {
          type = 'interactive'
          content = sanitizeText(
            message.interactiveMessage.body?.text
            ?? message.interactiveMessage.header?.title
            ?? '[Mensagem interativa]'
          )
          const rawButtons = message.interactiveMessage.nativeFlowMessage?.buttons
          if (Array.isArray(rawButtons) && rawButtons.length > 0) {
            const buttons = rawButtons.map((btn: any) => {
              try {
                const params = JSON.parse(btn.buttonParamsJson || '{}')
                return {
                  type: btn.name || 'button',
                  display_text: sanitizeShort(params.display_text || 'Clique aqui', 80),
                  url: sanitizeShort(params.url || null, 500),
                  id: sanitizeShort(params.id || null, 128),
                }
              } catch {
                return { type: btn.name || 'button', display_text: 'Clique aqui', url: null, id: null }
              }
            })
            linkPreview = { type: 'buttons', buttons }
          }
        }
        // ============================================
        // RESPOSTAS A INTERAÇÕES (cliques do usuário)
        // ============================================
        else if (message.buttonsResponseMessage) {
          type = 'text'
          content = sanitizeText(message.buttonsResponseMessage.selectedDisplayText || 'Opção selecionada')
        } else if (message.listResponseMessage) {
          type = 'text'
          content = sanitizeText(
            message.listResponseMessage.title
            ?? message.listResponseMessage.singleSelectReply?.selectedRowId
            ?? 'Opção selecionada'
          )
        } else if (message.templateButtonReplyMessage) {
          type = 'text'
          content = sanitizeText(message.templateButtonReplyMessage.selectedDisplayText || 'Opção')
        } else if (message.interactiveResponseMessage) {
          type = 'text'
          let parsed: any = null
          try {
            parsed = JSON.parse(message.interactiveResponseMessage.nativeFlowResponseMessage?.paramsJson || '{}')
          } catch { /* ignore */ }
          content = sanitizeText(
            parsed?.id
            ?? parsed?.display_text
            ?? message.interactiveResponseMessage.body?.text
            ?? 'Resposta recebida'
          )
        } else if (message.nativeFlowResponseMessage) {
          type = 'text'
          let parsed: any = null
          try {
            parsed = JSON.parse(message.nativeFlowResponseMessage.paramsJson || '{}')
          } catch { /* ignore */ }
          content = sanitizeText(
            parsed?.id
            ?? parsed?.display_text
            ?? message.nativeFlowResponseMessage.body?.text
            ?? 'Resposta recebida'
          )
        }
        // ============================================
        // FALLBACK: tipo desconhecido
        // ============================================
        else {
          const unknownType = Object.keys(message).find(k => k !== 'messageContextInfo') || 'unknown'
          await log('warn', 'unknown_message_type', `Tipo de mensagem não mapeado: ${unknownType}`, {
            message_id: messageId,
            unknown_type: unknownType,
            keys: Object.keys(message),
          })
          type = 'text'
          content = ''
        }

        const timestamp = messageTimestamp
          ? new Date(messageTimestamp * 1000).toISOString()
          : new Date().toISOString()

        const lastMsgText = type === 'text' ? content :
          type === 'image' ? '📷 Imagem' :
          type === 'audio' ? '🎵 Áudio' :
          type === 'video' ? '🎥 Vídeo' :
          type === 'document' ? `📄 ${fileName || 'Documento'}` :
          type === 'sticker' ? '🏷️ Sticker' :
          type === 'location' ? '📍 Localização' :
          type === 'interactive' ? (content || '🔘 Mensagem interativa') : content

        // Check existing conversation
        const { data: existingConv } = await supabase
          .from('conversations')
          .select('id, unread_count')
          .eq('company_id', resolvedCompanyId)
          .eq('instance_name', instance)
          .eq('remote_jid', remoteJid)
          .maybeSingle()

        const { data: conversation, error: convError } = await supabase
          .from('conversations')
          .upsert({
            company_id: resolvedCompanyId,
            instance_name: instance,
            instance_id: resolvedInstanceId,
            remote_jid: remoteJid,
            phone,
            // Só atualiza contact_name com pushName quando a mensagem é do contato
            // (fromMe=true traz o nome do agente/operador, contaminando o cadastro do lead)
            contact_name: !fromMe && pushName ? pushName : undefined,
            last_message_text: lastMsgText.substring(0, 200),
            last_message_at: timestamp,
          }, { onConflict: 'company_id,instance_name,remote_jid' })
          .select('id, unread_count')
          .single()

        if (convError || !conversation) {
          await log('error', 'conversation_upsert', `Falha ao criar/atualizar conversa: ${convError?.message}`, { phone, remote_jid: remoteJid })
          break
        }

        // Increment unread count for incoming messages (atomic, no race)
        if (!fromMe) {
          await supabase.rpc('bump_conversation_unread', { _conversation_id: conversation.id })
        }


        // Insert / merge message.
        // Para `from_me=true` evitamos criar uma linha "órfã" quando o eco do
        // provider chega ANTES do worker `process-outbound-messages` persistir
        // (race que causava bubbles duplicados sem `client_id`).
        // Estratégia: tentar UPDATE primeiro; só fazer INSERT se nenhuma linha
        // foi afetada (significa que o worker ainda não persistiu — caso raro
        // de mensagem enviada por fora da fila, como Cloud API direto).
        let msgError: any = null
        if (fromMe) {
          const { data: updated, error: updErr } = await supabase
            .from('chat_messages')
            .update({
              media_url: mediaUrl ?? undefined,
              media_mimetype: mediaMimetype ?? undefined,
              file_name: fileName ?? undefined,
              duration: duration ?? undefined,
              quoted_message_id: quotedMessageId ?? undefined,
              webhook_received_at: new Date().toISOString(),
              raw_data: payload.data,
              link_preview: linkPreview ?? undefined,
            })
            .eq('company_id', resolvedCompanyId)
            .eq('message_id', messageId)
            .select('id')
          if (updErr) msgError = updErr
          if (!updErr && (!updated || updated.length === 0)) {
            const { error: insErr } = await supabase.from('chat_messages').upsert({
              company_id: resolvedCompanyId,
              conversation_id: conversation.id,
              remote_jid: remoteJid,
              message_id: messageId,
              from_me: true,
              message_type: type,
              content,
              media_url: mediaUrl,
              media_mimetype: mediaMimetype,
              file_name: fileName,
              duration,
              latitude,
              longitude,
              quoted_message_id: quotedMessageId,
              reaction_emoji: reactionEmoji,
              status: 'sent',
              timestamp,
              webhook_received_at: new Date().toISOString(),
              raw_data: payload.data,
              link_preview: linkPreview,
            }, { onConflict: 'company_id,message_id' })
            if (insErr) msgError = insErr
          }
        } else {
          const { error: insErr } = await supabase.from('chat_messages').upsert({
            company_id: resolvedCompanyId,
            conversation_id: conversation.id,
            remote_jid: remoteJid,
            message_id: messageId,
            from_me: false,
            message_type: type,
            content,
            media_url: mediaUrl,
            media_mimetype: mediaMimetype,
            file_name: fileName,
            duration,
            latitude,
            longitude,
            quoted_message_id: quotedMessageId,
            reaction_emoji: reactionEmoji,
            status: 'received',
            sender_name: pushName,
            timestamp,
            webhook_received_at: new Date().toISOString(),
            raw_data: payload.data,
            link_preview: linkPreview,
          }, { onConflict: 'company_id,message_id' })
          if (insErr) msgError = insErr
        }

        // Mapeia LID → JID telefônico para que presence.update consiga
        // associar (Baileys envia presença com JID @lid sem nenhum mapping).
        if (!fromMe) {
          try {
            const k: any = data.key || {}
            const senderLid: string | undefined =
              k.senderLid || k.participantLid || k.participantAlt || k.previousRemoteJid
            const lid = (typeof senderLid === 'string' && senderLid.endsWith('@lid'))
              ? senderLid : null
            if (lid && remoteJid.endsWith('@s.whatsapp.net')) {
              await supabase.from('whatsapp_lid_map').upsert({
                company_id: resolvedCompanyId,
                lid,
                phone_jid: remoteJid,
                instance_name: instance,
                last_seen_at: new Date().toISOString(),
              }, { onConflict: 'company_id,lid' })
            }
          } catch (e) {
            console.warn('[Webhook] lid map upsert failed:', (e as Error)?.message)
          }
        }


        if (msgError) {
          await log('error', 'message_insert', `Falha ao inserir mensagem: ${msgError.message}`, { message_id: messageId, type })
          // Enqueue retry to ensure message is not lost
          try {
            await supabase.rpc('enqueue_webhook_retry', {
              _company_id: resolvedCompanyId,
              _kind: 'persist_message',
              _message_id: messageId,
              _provider: 'evolution',
              _payload: {
                company_id: resolvedCompanyId,
                conversation_id: conversation.id,
                remote_jid: remoteJid,
                message_id: messageId,
                from_me: fromMe,
                message_type: type,
                content,
                media_url: mediaUrl,
                media_mimetype: mediaMimetype,
                file_name: fileName,
                duration,
                latitude,
                longitude,
                quoted_message_id: quotedMessageId,
                reaction_emoji: reactionEmoji,
                status: fromMe ? 'sent' : 'received',
                sender_name: fromMe ? null : pushName,
                timestamp,
                raw_data: payload.data,
                link_preview: linkPreview,
              },
              _initial_error: msgError.message,
            })
            await log('warn', 'persist.retry_enqueued', 'Persistência enfileirada para retry', { message_id: messageId })
          } catch (e) {
            console.error('[Retry enqueue] failed:', e)
          }
        } else {
          await log('info', 'message_received', `Mensagem ${type} ${fromMe ? 'enviada' : 'recebida'} de ${phone}`, { message_id: messageId, type, from_me: fromMe })

          // Download and store media in Supabase Storage (async, non-blocking for text)
          if (mediaUrl && ['audio', 'image', 'video', 'document', 'sticker'].includes(type)) {
            const stored = await downloadAndStoreMedia(
              supabase, instance, messageId, resolvedCompanyId, type, mediaMimetype, log
            )
            if (stored?.path) {
              // Atualiza apenas o path — signed URL é gerada sob demanda
              // pelo cliente para evitar URLs expiradas no DB.
              await supabase
                .from('chat_messages')
                .update({ media_storage_path: stored.path, media_url: null })
                .eq('message_id', messageId)
                .eq('company_id', resolvedCompanyId)
            }
          }
        }

        // Link conversation to lead
        if (!existingConv) {
          const { data: lead } = await supabase
            .from('leads')
            .select('id')
            .eq('company_id', resolvedCompanyId)
            .eq('phone', phone)
            .limit(1)
            .maybeSingle()

          if (lead) {
            await supabase
              .from('conversations')
              .update({ lead_id: lead.id })
              .eq('id', conversation.id)
            await log('info', 'lead_linked', `Conversa vinculada ao lead ${lead.id}`, { lead_id: lead.id, phone })
          }
        }

        break
      }

      case 'messages.update': {
        const updates = Array.isArray(payload.data) ? payload.data : [payload.data]

        const statusMap: Record<string, string> = {
          // String-based status names (some Evolution API versions)
          'PENDING': 'pending',
          'SERVER_ACK': 'sent',
          'DELIVERY_ACK': 'delivered',
          'READ': 'read',
          'READ_SELF': 'read',
          'PLAYED': 'played',
          'PLAYED_SELF': 'played',
          'ERROR': 'error',
          'DELETED': 'error',
          // Numeric status codes (Evolution API v2)
          '0': 'error',
          '1': 'pending',
          '2': 'sent',
          '3': 'delivered',
          '4': 'read',
          '5': 'played',
        }

        for (const update of updates) {
          if (!update) continue

          // Multi-format messageId extraction (Evolution API has many shapes)
          const messageId =
            update?.key?.id ||
            update?.keyId ||
            update?.messageId ||
            update?.id ||
            update?.update?.key?.id ||
            null

          // Multi-format status extraction
          const rawStatus =
            update?.update?.status ??
            update?.status ??
            update?.messageStatus ??
            null

          if (!messageId || rawStatus === undefined || rawStatus === null) {
            await log('warn', 'status_update_skipped', 'messages.update sem messageId/status reconhecível', {
              keys: Object.keys(update || {}),
              sample: JSON.stringify(update).slice(0, 500),
            })
            continue
          }

          const statusKey = String(rawStatus)
          const newStatus =
            statusMap[statusKey] ||
            statusMap[statusKey.toUpperCase?.()] ||
            null

          if (!newStatus) {
            await log('warn', 'status_update_unknown', `Status não mapeado: ${statusKey}`, { message_id: messageId, raw_status: rawStatus })
            continue
          }

          await log('info', 'status_update', `Status update: ${messageId} → ${rawStatus} → ${newStatus}`, {
            message_id: messageId,
            raw_status: rawStatus,
            resolved_status: newStatus,
          })

          // Usa RPC atômica que ignora ACKs antigos/duplicados (evita regressão
          // de status quando a Evolution reentrega webhooks fora de ordem).
          const { data: appliedStatus, error } = await supabase.rpc('set_chat_message_status', {
            _message_id: messageId,
            _company_id: resolvedCompanyId,
            _status: newStatus,
          })

          const enqueueStatusRetry = async (reason: string) => {
            try {
              await supabase.rpc('enqueue_webhook_retry', {
                _company_id: resolvedCompanyId,
                _kind: 'status_update',
                _message_id: messageId,
                _provider: 'evolution',
                _payload: { message_id: messageId, status: newStatus },
                _initial_error: reason,
              })
              await log('warn', 'status.retry_enqueued', `Status enfileirado para retry: ${reason}`, { message_id: messageId, status: newStatus })
            } catch (e) {
              console.error('[Status retry enqueue] failed:', e)
            }
          }

          if (error) {
            await log('error', 'status_update', `Falha ao atualizar status: ${error.message}`, { message_id: messageId, status: newStatus })
            await enqueueStatusRetry(error.message)
          } else if (appliedStatus === null) {
            // Mensagem ainda não persistida (race) → enfileira
            await enqueueStatusRetry('message_not_found_yet')
          } else if (appliedStatus && appliedStatus !== newStatus) {
            await log('info', 'status_update_ignored', `ACK antigo ignorado: ${newStatus} (atual: ${appliedStatus})`, {
              message_id: messageId,
              attempted: newStatus,
              kept: appliedStatus,
            })
          }

          if (newStatus === 'error') {
            await log('error', 'message_delivery_error', `Mensagem falhou na entrega: ${messageId}`, { message_id: messageId })
          }
        }
        break
      }

      case 'messages.delete': {
        if (payload.data?.key?.id) {
          await supabase
            .from('chat_messages')
            .delete()
            .eq('message_id', payload.data.key.id)
            .eq('company_id', resolvedCompanyId)
        }
        break
      }

      case 'connection.update': {
        const state = payload.data?.state || payload.data?.status
        if (state) {
          const statusMap: Record<string, string> = {
            'open': 'connected',
            'close': 'disconnected',
            'connecting': 'connecting',
          }
          const dbStatus = statusMap[state] || state

          // Extract owner phone — supports JID ("5511...@s.whatsapp.net"),
          // numbers without "@", or formatted strings like "+55 (11) 9..."
          const sanitizePhone = (raw: unknown): string | null => {
            if (raw == null) return null
            const str = typeof raw === 'number' ? String(raw) : String(raw || '')
            if (!str) return null
            const beforeAt = str.split('@')[0].split(':')[0]
            const digits = beforeAt.replace(/\D/g, '')
            return digits.length >= 10 && digits.length <= 15 ? digits : null
          }
          const phoneFromJid =
            sanitizePhone(payload.data?.wuid) ||
            sanitizePhone(payload.data?.owner) ||
            sanitizePhone(payload.data?.ownerJid) ||
            sanitizePhone(payload.data?.jid) ||
            sanitizePhone(payload.data?.number) ||
            sanitizePhone(payload.data?.phone) ||
            sanitizePhone(payload.data?.me) ||
            sanitizePhone(payload.data?.user) ||
            sanitizePhone(payload.sender) ||
            sanitizePhone(payload.data?.instance?.owner) ||
            sanitizePhone(payload.data?.instance?.wuid) ||
            sanitizePhone(payload.data?.instance?.number) ||
            null

          const updatePayload: Record<string, unknown> = {
            status: dbStatus,
            updated_at: new Date().toISOString(),
          }
          if (state === 'open' && phoneFromJid) {
            updatePayload.phone_connected = phoneFromJid
          }
          if (state === 'close') {
            updatePayload.phone_connected = null
          }

          await supabase
            .from('whatsapp_instances')
            .update(updatePayload)
            .eq('instance_name', instance)
            .eq('company_id', resolvedCompanyId)

          const logLevel = state === 'close' ? 'warn' : 'info'
          await log(logLevel, 'connection_update', `Conexão: ${state} → ${dbStatus}`, { state, db_status: dbStatus, phone: phoneFromJid })
        }
        break
      }

      case 'presence.update': {
        // Broadcast presence (typing) via Realtime channel — no DB needed
        const presenceData = payload.data
        const remoteJid = presenceData?.remoteJid || presenceData?.id
        const presenceStatus = presenceData?.presences?.[remoteJid]?.lastKnownPresence
          || presenceData?.presence || presenceData?.status || 'unavailable'

        if (remoteJid && resolvedCompanyId) {
          // Canal escopado por conversa para reduzir broadcast cross-tenant
          const channelName = `presence-${resolvedCompanyId}-${remoteJid}`
          const channel = supabase.channel(channelName)
          await channel.send({
            type: 'broadcast',
            event: 'typing',
            payload: {
              remote_jid: remoteJid,
              presence: presenceStatus, // 'composing', 'recording', 'paused', 'available', 'unavailable'
              timestamp: new Date().toISOString(),
            },
          })
          supabase.removeChannel(channel)
        }
        break
      }

      default:
        await log('debug', 'unhandled_event', `Evento não tratado: ${event}`, { event, normalized_event: normalizedEvent })
        console.log(`[Webhook] Unhandled event: ${event}`)
    }

    return
   } catch (error) {
    console.error('[Webhook] Error:', error)
    try {
      await supabase.from('system_logs').insert({
        source: 'evolution-webhook',
        level: 'error',
        event: 'webhook_crash',
        message: `Erro fatal no webhook: ${String(error)}`,
        metadata: { error: String(error) },
      })
    } catch { /* ignore logging failure */ }
   }
  })()

  // @ts-ignore — EdgeRuntime existe no runtime do Supabase Edge Functions
  if (typeof EdgeRuntime !== 'undefined' && (EdgeRuntime as any).waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(processing)
  }

  return new Response(JSON.stringify({ ok: true, queued: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
