/**
 * Lógica de despacho de mensagens de saída — compartilhada entre:
 *   - enqueue-outbound-message (fast-path inline: envia ainda na requisição do user)
 *   - process-outbound-messages (worker da fila: cron 1/min + retries)
 *
 * Antes essa lógica vivia duplicada / acoplada ao worker. Agora ambos os
 * caminhos chamam `dispatchOutbound(item)` e dividem o mesmo código.
 */

export type Kind = 'text' | 'image' | 'video' | 'audio' | 'document'

export interface MediaSpec {
  url: string
  mimeType: string
  fileName?: string
  caption?: string
}

export interface QueueRow {
  id: string
  client_id: string
  company_id: string
  conversation_id: string
  user_id: string | null
  provider: 'evolution' | 'cloud_api'
  payload: Record<string, unknown>
  retry_count: number
}

export interface SendResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

export interface SendContext {
  phone: string
  remote_jid: string
  instance_id: string
  instance_name: string
  config: Record<string, unknown>
}

export function detectKind(payload: Record<string, unknown>): { kind: Kind; media?: MediaSpec; text?: string; quoted?: unknown } {
  const text = typeof payload.text === 'string' ? payload.text : ''
  const media = (payload.media as MediaSpec | undefined) ?? undefined
  const explicit = typeof payload.kind === 'string' ? (payload.kind as Kind) : undefined
  if (explicit && explicit !== 'text') return { kind: explicit, media, text, quoted: payload.quoted }
  if (media?.url) {
    const m = media.mimeType || ''
    let k: Kind = 'document'
    if (m.startsWith('image/')) k = 'image'
    else if (m.startsWith('video/')) k = 'video'
    else if (m.startsWith('audio/')) k = 'audio'
    return { kind: k, media, text: media.caption ?? text, quoted: payload.quoted }
  }
  return { kind: 'text', text, quoted: payload.quoted }
}

export async function loadSendContext(supabase: any, conversationId: string): Promise<SendContext | null> {
  const { data, error } = await supabase
    .from('conversations')
    .select('phone, remote_jid, instance_id, whatsapp_instances:instance_id(instance_name, config)')
    .eq('id', conversationId)
    .maybeSingle()
  if (error || !data?.phone || !data.instance_id) return null
  const inst = (data as any).whatsapp_instances ?? {}
  return {
    phone: (data as any).phone,
    remote_jid: (data as any).remote_jid ?? '',
    instance_id: (data as any).instance_id,
    instance_name: inst.instance_name ?? '',
    config: inst.config ?? {},
  }
}

function buildEvolutionQuoted(q: unknown): Record<string, unknown> | null {
  if (!q || typeof q !== 'object') return null
  const obj = q as Record<string, unknown>
  if (obj.key && typeof obj.key === 'object') {
    const msg = (obj.message && typeof obj.message === 'object') ? obj.message as Record<string, unknown> : { conversation: '' }
    return { key: obj.key, message: msg }
  }
  const remoteJid = typeof obj.remoteJid === 'string' ? obj.remoteJid : ''
  const id = typeof obj.id === 'string' ? obj.id : ''
  if (!remoteJid || !id) return null
  return {
    key: { remoteJid, fromMe: Boolean(obj.fromMe), id },
    message: { conversation: typeof obj.message === 'string' ? obj.message : '' },
  }
}

export async function sendEvolution(ctx: SendContext, payload: Record<string, unknown>): Promise<SendResult> {
  const baseUrl = (ctx.config?.baseUrl as string | undefined)
    || Deno.env.get('EVOLUTION_MASTER_URL')
    || Deno.env.get('EVOLUTION_API_URL')
    || ''
  const apiKey = (ctx.config?.apiKey as string | undefined)
    || Deno.env.get('EVOLUTION_MASTER_API_KEY')
    || Deno.env.get('EVOLUTION_API_KEY')
    || ''
  const instanceName = ctx.instance_name
  if (!baseUrl || !apiKey || !instanceName) return { ok: false, error: 'instance_config_missing' }

  const { kind, media, text, quoted } = detectKind(payload)
  const root = baseUrl.replace(/\/$/, '')
  let url = ''
  let body: Record<string, unknown> = {}

  if (kind === 'text') {
    if (!text) return { ok: false, error: 'empty_text' }
    url = `${root}/message/sendText/${encodeURIComponent(instanceName)}`
    body = { number: ctx.phone, text }
    const q = buildEvolutionQuoted(quoted)
    if (q) body.quoted = q
  } else if (kind === 'audio') {
    if (!media?.url) return { ok: false, error: 'missing_media_url' }
    url = `${root}/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`
    body = { number: ctx.phone, audio: media.url }
  } else {
    if (!media?.url) return { ok: false, error: 'missing_media_url' }
    url = `${root}/message/sendMedia/${encodeURIComponent(instanceName)}`
    body = {
      number: ctx.phone,
      mediatype: kind === 'document' ? 'document' : kind,
      mimetype: media.mimeType,
      media: media.url,
      fileName: media.fileName ?? undefined,
      caption: media.caption ?? text ?? undefined,
    }
    const q = buildEvolutionQuoted(quoted)
    if (q) body.quoted = q
  }

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    const txt = await resp.text()
    if (!resp.ok) return { ok: false, error: `evolution_${resp.status}:${txt.slice(0, 200)}` }
    let json: any = null
    try { json = JSON.parse(txt) } catch { /* ignore */ }
    const messageId: string | undefined = json?.key?.id ?? json?.messageId
    if (!messageId) return { ok: false, error: 'evolution_no_message_id' }
    return { ok: true, providerMessageId: messageId }
  } catch (e) {
    return { ok: false, error: `evolution_fetch:${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function sendCloudApi(ctx: SendContext, payload: Record<string, unknown>): Promise<SendResult> {
  const phoneNumberId = ctx.config?.phoneNumberId as string | undefined
  const accessToken = ctx.config?.accessToken as string | undefined
  if (!phoneNumberId || !accessToken) return { ok: false, error: 'instance_config_missing' }

  const { kind, media, text, quoted } = detectKind(payload)
  let body: Record<string, unknown>
  if (kind === 'text') {
    if (!text) return { ok: false, error: 'empty_text' }
    body = { messaging_product: 'whatsapp', to: ctx.phone, type: 'text', text: { body: text, preview_url: true } }
  } else if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'document') {
    if (!media?.url) return { ok: false, error: 'missing_media_url' }
    const mediaObj: Record<string, unknown> = { link: media.url }
    if (kind !== 'audio' && media.caption) mediaObj.caption = media.caption
    if (kind === 'document' && media.fileName) mediaObj.filename = media.fileName
    body = { messaging_product: 'whatsapp', to: ctx.phone, type: kind, [kind]: mediaObj }
  } else {
    return { ok: false, error: 'unsupported_kind' }
  }

  const quotedId = (quoted as any)?.id ?? (quoted as any)?.key?.id ?? null
  if (quotedId) body.context = { message_id: quotedId }

  try {
    const resp = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    const txt = await resp.text()
    if (!resp.ok) return { ok: false, error: `cloud_${resp.status}:${txt.slice(0, 300)}` }
    const json = JSON.parse(txt)
    const messageId: string | undefined = json?.messages?.[0]?.id
    if (!messageId) return { ok: false, error: 'cloud_no_message_id' }
    return { ok: true, providerMessageId: messageId }
  } catch (e) {
    return { ok: false, error: `cloud_fetch:${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function persistChatMessage(
  supabase: any,
  item: QueueRow,
  ctx: SendContext,
  providerMessageId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { kind, media, text } = detectKind(item.payload)
  const quoted = (item.payload as any).quoted
  const quotedId = (quoted as any)?.id ?? (quoted as any)?.key?.id ?? null
  const now = new Date().toISOString()

  const lastText = kind === 'text' ? (text ?? '')
    : kind === 'image' ? '[Imagem]'
    : kind === 'video' ? '[Vídeo]'
    : kind === 'audio' ? '[Áudio]'
    : '[Arquivo]'

  const upsertPromise = supabase.from('chat_messages').upsert(
    [{
      company_id: item.company_id,
      conversation_id: item.conversation_id,
      remote_jid: ctx.remote_jid,
      message_id: providerMessageId,
      provider: item.provider,
      provider_message_id: providerMessageId,
      client_id: item.client_id,
      from_me: true,
      message_type: kind,
      content: text ?? '',
      media_url: media?.url ?? null,
      media_mimetype: media?.mimeType ?? null,
      file_name: media?.fileName ?? null,
      quoted_message_id: quotedId,
      status: 'sent',
      timestamp: now,
    }],
    { onConflict: 'company_id,message_id' },
  )
  const updatePromise = supabase.from('conversations')
    .update({ last_message_text: lastText, last_message_at: now })
    .eq('id', item.conversation_id)

  const [{ error: upErr }] = await Promise.all([upsertPromise, updatePromise])
  if (upErr) {
    console.error('[outbound-dispatch] upsert chat_messages failed:', upErr.message)
    return { ok: false, error: `persist_failed:${upErr.message.slice(0, 200)}` }
  }
  return { ok: true }
}

/**
 * Idempotência: verifica se este client_id já foi enviado em alguma execução
 * anterior (chat_messages.client_id é a chave deduplicadora estável definida
 * pelo browser). Se sim, devolve o provider_message_id existente para que
 * possamos pular o envio ao provider e apenas finalizar a fila.
 */
async function findAlreadySentProviderMessageId(supabase: any, item: QueueRow): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('chat_messages')
      .select('provider_message_id')
      .eq('company_id', item.company_id)
      .eq('client_id', item.client_id)
      .not('provider_message_id', 'is', null)
      .limit(1)
      .maybeSingle()
    return (data as any)?.provider_message_id ?? null
  } catch {
    return null
  }
}

/**
 * Despacha um item já claimed (status='processing') para o provider e
 * marca sent/failed. Retorna 'success' | 'failed' | 'dead'.
 *
 * Guarantees:
 *  - Idempotência: se já houver chat_messages com mesmo (company_id, client_id)
 *    e provider_message_id != null, pulamos o envio ao provider.
 *  - Se o envio ao provider tiver sucesso mas o persist no banco falhar,
 *    chamamos mark_outbound_failed com _already_sent=true. Isso parqueia o
 *    item em status='sent_persist_failed' (NÃO reenfileira) — evita entrega
 *    duplicada ao destinatário no WhatsApp.
 */
export async function dispatchOutbound(supabase: any, item: QueueRow): Promise<'success' | 'failed' | 'dead'> {
  try {
    const ctx = await loadSendContext(supabase, item.conversation_id)
    if (!ctx) {
      const { data: status } = await supabase.rpc('mark_outbound_failed', { _id: item.id, _error: 'conversation_missing' })
      return status === 'dead' ? 'dead' : 'failed'
    }

    // Idempotência: já enviado em tentativa anterior? Não envia de novo.
    const alreadySentId = await findAlreadySentProviderMessageId(supabase, item)
    if (alreadySentId) {
      await supabase.rpc('mark_outbound_sent', { _id: item.id, _provider_message_id: alreadySentId })
      console.log('[outbound-dispatch] idempotent skip — already sent:', item.id, alreadySentId)
      return 'success'
    }

    const result = item.provider === 'cloud_api'
      ? await sendCloudApi(ctx, item.payload)
      : await sendEvolution(ctx, item.payload)

    if (result.ok && result.providerMessageId) {
      const providerMessageId = result.providerMessageId
      const persist = await persistChatMessage(supabase, item, ctx, providerMessageId)
      if (!persist.ok) {
        // Mensagem JÁ saiu pelo provider. Não pode reenviar — parqueia.
        const { data: status } = await supabase.rpc('mark_outbound_failed', {
          _id: item.id,
          _error: (persist.error ?? 'persist_failed').slice(0, 1000),
          _already_sent: true,
        })
        console.error('[outbound-dispatch] sent_persist_failed (no resend):', item.id, providerMessageId, persist.error)
        return status === 'dead' ? 'dead' : 'failed'
      }
      await supabase.rpc('mark_outbound_sent', { _id: item.id, _provider_message_id: providerMessageId })
      return 'success'
    }
    const { data: status } = await supabase.rpc('mark_outbound_failed', { _id: item.id, _error: (result.error ?? 'unknown').slice(0, 1000) })
    return status === 'dead' ? 'dead' : 'failed'
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const { data: status } = await supabase.rpc('mark_outbound_failed', { _id: item.id, _error: msg.slice(0, 1000) })
    console.error('[outbound-dispatch] item error:', item.id, msg)
    return status === 'dead' ? 'dead' : 'failed'
  }
}
