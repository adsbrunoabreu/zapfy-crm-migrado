/**
 * cloudHandler — recebe webhooks da WhatsApp Cloud API (Meta) e persiste
 * mensagens normalizadas em `chat_messages`.
 *
 * Validações:
 *   1. `X-Hub-Signature-256: sha256=<hmac>` calculado com `appSecret` do
 *      record `whatsapp_instances` correspondente ao `phone_number_id`.
 *   2. Estrutura mínima do envelope (`object`, `entry[]`, `changes[]`).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GRAPH_BASE = 'https://graph.facebook.com/v18.0'

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

/**
 * Faz download de uma mídia do WhatsApp Cloud API e armazena no bucket
 * privado `chat-media`. Retorna o storage path quando bem-sucedido.
 */
export async function downloadCloudMedia(
  supabase: SupabaseClient,
  args: {
    accessToken: string
    mediaId: string
    companyId: string
    messageId: string
    mediaType: string
    fallbackMime: string | null
  },
): Promise<{ path: string; mime: string } | null> {
  const { accessToken, mediaId, companyId, messageId, mediaType, fallbackMime } = args
  try {
    // 1. Resolve URL temporária do binário
    const metaResp = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!metaResp.ok) {
      console.error('[cloudHandler.media] meta fetch failed', metaResp.status, await metaResp.text())
      return null
    }
    const meta = await metaResp.json() as { url?: string; mime_type?: string }
    if (!meta.url) return null

    const mime = meta.mime_type || fallbackMime || 'application/octet-stream'

    // 2. Baixa o binário
    const binResp = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(45000),
    })
    if (!binResp.ok) {
      console.error('[cloudHandler.media] binary fetch failed', binResp.status)
      return null
    }
    const buf = new Uint8Array(await binResp.arrayBuffer())

    // 3. Upload para chat-media (privado, path por company_id)
    const ext = getExtFromMime(mime)
    const path = `${companyId}/${mediaType}/${messageId}.${ext}`
    const { error: upErr } = await supabase.storage
      .from('chat-media')
      .upload(path, buf, { contentType: mime, upsert: true })
    if (upErr) {
      console.error('[cloudHandler.media] upload failed', upErr.message)
      return null
    }
    return { path, mime }
  } catch (e) {
    console.error('[cloudHandler.media] error', (e as Error)?.message)
    return null
  }
}

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

function toHex(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < view.length; i++) out += view[i].toString(16).padStart(2, '0')
  return out
}

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return toHex(sig)
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

interface ParsedMsg {
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact' | 'reaction' | 'interactive' | 'unknown'
  content: string | null
  mediaId: string | null
  mediaMime: string | null
  fileName: string | null
  linkPreview: Record<string, unknown> | null
}

function sanitizeShort(s: unknown, max = 128): string | null {
  if (typeof s !== 'string') return null
  const v = s.replace(/\u0000/g, '').trim().slice(0, max)
  return v || null
}

export function parseCloudMessage(message: Record<string, unknown>): ParsedMsg {
  const t = String(message.type ?? '')
  const m = (k: string) => message[k] as Record<string, unknown> | undefined
  const base = { mediaId: null, mediaMime: null, fileName: null, linkPreview: null }
  switch (t) {
    case 'text':
      return { type: 'text', content: (m('text')?.body as string) ?? null, ...base }
    case 'image':
      return { type: 'image', content: (m('image')?.caption as string) ?? null, mediaId: (m('image')?.id as string) ?? null, mediaMime: (m('image')?.mime_type as string) ?? null, fileName: null, linkPreview: null }
    case 'video':
      return { type: 'video', content: (m('video')?.caption as string) ?? null, mediaId: (m('video')?.id as string) ?? null, mediaMime: (m('video')?.mime_type as string) ?? null, fileName: null, linkPreview: null }
    case 'audio':
      return { type: 'audio', content: null, mediaId: (m('audio')?.id as string) ?? null, mediaMime: (m('audio')?.mime_type as string) ?? null, fileName: null, linkPreview: null }
    case 'document':
      return { type: 'document', content: (m('document')?.caption as string) ?? null, mediaId: (m('document')?.id as string) ?? null, mediaMime: (m('document')?.mime_type as string) ?? null, fileName: (m('document')?.filename as string) ?? null, linkPreview: null }
    case 'sticker':
      return { type: 'sticker', content: null, mediaId: (m('sticker')?.id as string) ?? null, mediaMime: (m('sticker')?.mime_type as string) ?? null, fileName: null, linkPreview: null }
    case 'location': {
      const loc = m('location') ?? {}
      const lat = (loc as Record<string, unknown>).latitude
      const lng = (loc as Record<string, unknown>).longitude
      const name = (loc as Record<string, unknown>).name as string | undefined
      const addr = (loc as Record<string, unknown>).address as string | undefined
      const linkPreview = { type: 'location', latitude: lat, longitude: lng, name: name ?? null, address: addr ?? null }
      return { type: 'location', content: name || addr || '[location]', mediaId: null, mediaMime: null, fileName: null, linkPreview }
    }
    case 'contacts':
      return { type: 'contact', content: '[contact]', ...base }
    case 'reaction':
      return { type: 'reaction', content: (m('reaction')?.emoji as string) ?? null, ...base }
    case 'interactive': {
      // Respostas de interactive (button_reply, list_reply, nfm_reply) → vira TEXTO
      const inter = (m('interactive') ?? {}) as Record<string, unknown>
      const itype = String(inter.type ?? '')
      if (itype === 'button_reply') {
        const br = (inter.button_reply ?? {}) as Record<string, unknown>
        return { type: 'text', content: sanitizeShort(br.title, 1024) || sanitizeShort(br.id, 128) || 'Opção selecionada', ...base }
      }
      if (itype === 'list_reply') {
        const lr = (inter.list_reply ?? {}) as Record<string, unknown>
        const title = sanitizeShort(lr.title, 1024)
        const desc = sanitizeShort(lr.description, 1024)
        const txt = title ? (desc ? `${title} — ${desc}` : title) : sanitizeShort(lr.id, 128) || 'Opção selecionada'
        return { type: 'text', content: txt, ...base }
      }
      if (itype === 'nfm_reply') {
        const nfm = (inter.nfm_reply ?? {}) as Record<string, unknown>
        return { type: 'text', content: sanitizeShort(nfm.body, 1024) || sanitizeShort(nfm.name, 128) || 'Resposta de Flow', ...base }
      }
      // Fallback: payload interativo desconhecido — mantém como interactive
      return { type: 'interactive', content: '[Mensagem interativa]', mediaId: null, mediaMime: null, fileName: null, linkPreview: { type: 'interactive_raw', interactive: inter } }
    }
    case 'button': {
      // Resposta de botão de template HSM (legado) → vira TEXTO
      const btn = (m('button') ?? {}) as Record<string, unknown>
      return { type: 'text', content: sanitizeShort(btn.text, 1024) || sanitizeShort(btn.payload, 256) || 'Opção selecionada', ...base }
    }
    case 'order': {
      const order = (m('order') ?? {}) as Record<string, unknown>
      const items = Array.isArray(order.product_items) ? (order.product_items as Array<Record<string, unknown>>) : []
      return { type: 'interactive', content: order.text as string ?? `[Pedido com ${items.length} item(ns)]`, mediaId: null, mediaMime: null, fileName: null, linkPreview: { type: 'order', catalog_id: order.catalog_id ?? null, product_items: items, text: order.text ?? null } }
    }
    case 'system':
      return { type: 'text', content: ((m('system') ?? {}) as Record<string, unknown>).body as string ?? '[mensagem do sistema]', ...base }
    case 'unsupported':
      return { type: 'unknown', content: '[mensagem não suportada]', ...base }
    default:
      return { type: 'unknown', content: null, ...base }
  }
}

function normalizePhone(phone: string): string {
  return (phone || '').replace(/[^\d+]/g, '')
}

// Cache em memória (TTL 60s) dos números próprios da empresa para detectar
// "echo": quando o MESMO WhatsApp está conectado em dois provedores (ex.:
// Evolution + Cloud API), uma mensagem enviada por um provedor pode chegar
// como webhook do outro provedor — gerando uma conversa duplicada no chatlist.
const ownNumbersCache = new Map<string, { numbers: Set<string>; expiresAt: number }>()
const OWN_NUMBERS_TTL_MS = 60_000

async function getCompanyOwnNumbers(
  supabase: SupabaseClient,
  companyId: string,
): Promise<Set<string>> {
  const cached = ownNumbersCache.get(companyId)
  if (cached && cached.expiresAt > Date.now()) return cached.numbers

  const { data } = await supabase
    .from('whatsapp_instances')
    .select('phone_number, config')
    .eq('company_id', companyId)
    .eq('is_active', true)

  const numbers = new Set<string>()
  for (const row of (data ?? []) as Array<{ phone_number: string | null; config: Record<string, unknown> | null }>) {
    const direct = normalizePhone(row.phone_number ?? '')
    if (direct) numbers.add(direct)
    const cfgPhone = normalizePhone(((row.config ?? {}).phoneNumber as string) ?? '')
    if (cfgPhone) numbers.add(cfgPhone)
  }

  ownNumbersCache.set(companyId, { numbers, expiresAt: Date.now() + OWN_NUMBERS_TTL_MS })
  return numbers
}

/**
 * Tenta renderizar o body de um template HSM cadastrado em `whatsapp_hsm_templates`.
 * Retorna o texto do componente BODY (com placeholders {{1}} mantidos) ou null.
 */
async function renderHsmTemplateBody(
  supabase: SupabaseClient,
  companyId: string,
  templateName: string,
  language?: string | null,
): Promise<string | null> {
  if (!templateName) return null
  const full = await renderHsmTemplateFull(supabase, companyId, templateName, language)
  return full?.body ?? null
}

interface HsmFull {
  header: { format: string; text?: string; url?: string | null } | null
  body: string | null
  footer: string | null
  buttons: Array<{ type: string; display_text: string; url?: string | null; phone_number?: string | null }>
}

async function renderHsmTemplateFull(
  supabase: SupabaseClient,
  companyId: string,
  templateName: string,
  language?: string | null,
): Promise<HsmFull | null> {
  if (!templateName) return null
  let q = supabase
    .from('whatsapp_hsm_templates')
    .select('components, language')
    .eq('company_id', companyId)
    .eq('name', templateName)
    .limit(1)
  if (language) q = q.eq('language', language)
  const { data } = await q.maybeSingle()
  if (!data) return null
  const components = (data.components ?? []) as Array<Record<string, unknown>>
  let header: HsmFull['header'] = null
  let body: string | null = null
  let footer: string | null = null
  const buttons: HsmFull['buttons'] = []
  for (const comp of components) {
    const t = String(comp.type ?? '').toUpperCase()
    if (t === 'HEADER') {
      const fmt = String(comp.format ?? 'TEXT').toLowerCase()
      if (fmt === 'text') header = { format: 'text', text: String(comp.text ?? '') }
      else header = { format: fmt, url: null }
    } else if (t === 'BODY') {
      body = String(comp.text ?? '') || null
    } else if (t === 'FOOTER') {
      footer = String(comp.text ?? '') || null
    } else if (t === 'BUTTONS') {
      const btns = (comp.buttons as Array<Record<string, unknown>>) ?? []
      for (const b of btns) {
        const bt = String(b.type ?? '').toLowerCase()
        buttons.push({
          type: bt === 'url' ? 'cta_url' : bt,
          display_text: String(b.text ?? ''),
          url: typeof b.url === 'string' ? (b.url as string) : null,
          phone_number: typeof b.phone_number === 'string' ? (b.phone_number as string) : null,
        })
      }
    }
  }
  return { header, body, footer, buttons }
}

export async function handleCloudApi(ctx: HandlerCtx): Promise<{ messageId?: string; ignored?: string; processed?: number }> {
  const { supabase, headers, rawBody, payload, log } = ctx
  const env = (payload ?? {}) as Record<string, unknown>

  if (env.object !== 'whatsapp_business_account' && !Array.isArray(env.entry)) {
    await log(supabase, { event: 'cloud.bad_envelope', provider: 'cloud_api', status: 'warning' })
    return { ignored: 'bad_envelope' }
  }

  const entries = Array.isArray(env.entry) ? (env.entry as Array<Record<string, unknown>>) : []
  let processed = 0
  let lastMessageId: string | undefined

  for (const entry of entries) {
    const wabaId = typeof entry.id === 'string' ? entry.id : null
    const changes = Array.isArray(entry.changes) ? (entry.changes as Array<Record<string, unknown>>) : []
    for (const change of changes) {
      const field = String(change.field ?? '')

      // ── Coexistência: account_update ────────────────────────────────────
      if (field === 'account_update' && wabaId) {
        const value = (change.value ?? {}) as Record<string, unknown>
        const event = String(value.event ?? '').toUpperCase()
        const newStatus =
          event === 'PARTNER_REMOVED' || event === 'ACCOUNT_OFFBOARDED' ? 'disconnected'
          : event === 'ACCOUNT_RECONNECTED' ? 'connected'
          : null
        if (newStatus) {
          const { data: insts } = await supabase
            .from('whatsapp_instances')
            .select('id, company_id')
            .eq('provider', 'cloud_api')
            .filter('config->>businessAccountId', 'eq', wabaId)
            .limit(50)
          for (const inst of (insts ?? []) as Array<{ id: string; company_id: string }>) {
            await supabase
              .from('whatsapp_instances')
              .update({ status: newStatus, last_error: event })
              .eq('id', inst.id)
            await log(supabase, {
              company_id: inst.company_id,
              event: `coex.account_update.${event.toLowerCase()}`,
              provider: 'cloud_api',
              status: 'warning',
              metadata: { waba_id: wabaId, disconnection_info: value.disconnection_info ?? null },
            })
          }
        }
        continue
      }

      // ── Coexistência: smb_app_state_sync (contatos) ─────────────────────
      if (field === 'smb_app_state_sync' && wabaId) {
        const value = (change.value ?? {}) as Record<string, unknown>
        const contacts = Array.isArray(value.contacts) ? (value.contacts as Array<Record<string, unknown>>) : []
        const { data: inst } = await supabase
          .from('whatsapp_instances')
          .select('id, company_id, coexistence_state')
          .eq('provider', 'cloud_api')
          .filter('config->>businessAccountId', 'eq', wabaId)
          .maybeSingle()
        if (inst) {
          let imported = 0
          for (const c of contacts) {
            const phone = normalizePhone(String((c as Record<string, unknown>).wa_id ?? ''))
            const profileObj = (c.profile ?? {}) as Record<string, unknown>
            const name = String(profileObj.name ?? '').trim() || phone
            if (!phone) continue
            const { error: leadErr } = await supabase
              .from('leads')
              .upsert(
                [{ company_id: inst.company_id, phone, name, source: 'whatsapp_coexistence' }],
                { onConflict: 'company_id,phone', ignoreDuplicates: false },
              )
            if (!leadErr) imported++
          }
          const state = (inst.coexistence_state as Record<string, unknown> | null) ?? {}
          await supabase
            .from('whatsapp_instances')
            .update({
              coexistence_state: {
                ...state,
                contacts_status: 'completed',
                contacts_imported: Number(state.contacts_imported ?? 0) + imported,
              },
            })
            .eq('id', inst.id)
          await log(supabase, {
            company_id: inst.company_id,
            event: 'coex.contacts_synced',
            provider: 'cloud_api',
            status: 'success',
            metadata: { imported, total_in_payload: contacts.length },
          })
        }
        continue
      }

      // ── Coexistência: history (mensagens dos últimos 6 meses) ──────────
      if (field === 'history' && wabaId) {
        const value = (change.value ?? {}) as Record<string, unknown>
        const errors = Array.isArray(value.errors) ? (value.errors as Array<Record<string, unknown>>) : []
        const { data: inst } = await supabase
          .from('whatsapp_instances')
          .select('id, company_id, coexistence_state')
          .eq('provider', 'cloud_api')
          .filter('config->>businessAccountId', 'eq', wabaId)
          .maybeSingle()
        if (inst) {
          // Cliente recusou compartilhar histórico
          if (errors.some((e) => Number((e as Record<string, unknown>).code) === 2593109)) {
            const state = (inst.coexistence_state as Record<string, unknown> | null) ?? {}
            await supabase
              .from('whatsapp_instances')
              .update({ coexistence_state: { ...state, history_status: 'declined' } })
              .eq('id', inst.id)
            await log(supabase, {
              company_id: inst.company_id,
              event: 'coex.history_declined',
              provider: 'cloud_api',
              status: 'warning',
            })
          } else {
            // Enfileira chunk para o worker processar de forma assíncrona
            const phase = Number(((value.metadata ?? {}) as Record<string, unknown>).phase ?? 0)
            const chunkIndex = Number(((value.metadata ?? {}) as Record<string, unknown>).chunk_index ?? Date.now())
            const { error: enqErr } = await supabase.rpc('enqueue_coexistence_history_chunk', {
              _company_id: inst.company_id,
              _instance_id: inst.id,
              _phase: phase,
              _chunk_index: chunkIndex,
              _payload: value,
            })
            if (!enqErr) {
              const state = (inst.coexistence_state as Record<string, unknown> | null) ?? {}
              await supabase
                .from('whatsapp_instances')
                .update({
                  coexistence_state: {
                    ...state,
                    history_chunks_received: Number(state.history_chunks_received ?? 0) + 1,
                  },
                })
                .eq('id', inst.id)
            }
            await log(supabase, {
              company_id: inst.company_id,
              event: 'coex.history_chunk_enqueued',
              provider: 'cloud_api',
              status: enqErr ? 'error' : 'success',
              error_message: enqErr?.message ?? null,
              metadata: { phase, chunk_index: chunkIndex, msg_count: Array.isArray(value.messages) ? (value.messages as unknown[]).length : 0 },
            })
          }
        }
        continue
      }

      // ── Coexistência: smb_message_echoes ────────────────────────────────
      // A Meta entrega aqui mensagens enviadas pelo número via app WhatsApp
      // Business. O shape interno é compatível com `messages` — apenas
      // tratamos como echo (from_me=true) e seguimos pelo fluxo padrão.
      if (field === 'smb_message_echoes') {
        // Reescrevemos o field para 'messages' e marcamos no metadata para
        // que o caminho abaixo trate (o detector de echo usa from===displayPhone).
        ;(change as Record<string, unknown>).field = 'messages'
        ;((change as Record<string, unknown>).value as Record<string, unknown> | undefined) =
          (change.value ?? {}) as Record<string, unknown>
        const v = (change.value ?? {}) as Record<string, unknown>
        ;(v as Record<string, unknown>)._coex_echo = true
      }

      if (change.field !== 'messages') continue
      const value = (change.value ?? {}) as Record<string, unknown>
      const metadata = (value.metadata ?? {}) as Record<string, unknown>
      const phoneNumberId = String(metadata.phone_number_id ?? '')
      if (!phoneNumberId) continue

      // Resolve instance pelo phone_number_id (armazenado em config)
      const { data: instance, error: instErr } = await supabase
        .from('whatsapp_instances')
        .select('id, company_id, instance_name, config')
        .eq('provider', 'cloud_api')
        .filter('config->>phoneNumberId', 'eq', phoneNumberId)
        .maybeSingle()

      if (instErr || !instance) {
        await log(supabase, {
          event: 'cloud.instance_not_found',
          provider: 'cloud_api',
          status: 'error',
          error_message: instErr?.message ?? `phone_number_id ${phoneNumberId} sem instância`,
          metadata: { phone_number_id: phoneNumberId },
        })
        continue
      }

      const inst = instance as unknown as InstanceRow
      const appSecret = (inst.config?.appSecret as string | undefined) ?? null
      const sigHeader = headers.get('x-hub-signature-256') ?? ''
      const sigHex = sigHeader.replace(/^sha256=/i, '')

      // App Secret é opcional. Quando configurado, exigimos assinatura válida.
      // Quando ausente, processamos sem HMAC e auditamos como warning.
      if (appSecret) {
        if (!sigHex) {
          await log(supabase, {
            company_id: inst.company_id,
            event: 'cloud.signature_missing',
            provider: 'cloud_api',
            status: 'error',
            error_message: 'X-Hub-Signature-256 ausente apesar do appSecret configurado',
          })
          continue
        }
        const expected = await hmacSha256Hex(appSecret, rawBody)
        if (!constantTimeEqual(expected, sigHex)) {
          await log(supabase, {
            company_id: inst.company_id,
            event: 'cloud.signature_invalid',
            provider: 'cloud_api',
            status: 'error',
            error_message: 'HMAC mismatch',
          })
          continue
        }
      } else {
        await log(supabase, {
          company_id: inst.company_id,
          event: 'cloud.hmac_skipped',
          provider: 'cloud_api',
          status: 'warning',
          error_message: 'appSecret não configurado — HMAC não verificado',
        })
      }

      const messages = Array.isArray(value.messages) ? (value.messages as Array<Record<string, unknown>>) : []
      const contacts = Array.isArray(value.contacts) ? (value.contacts as Array<Record<string, unknown>>) : []

      const displayPhone = normalizePhone(String(metadata.display_phone_number ?? ''))

      for (const message of messages) {
        const messageId = typeof message.id === 'string' ? message.id : null
        const fromRaw = typeof message.from === 'string' ? message.from : ''
        const tsSec = Number(message.timestamp) || Math.floor(Date.now() / 1000)
        const timestamp = new Date(tsSec * 1000).toISOString()
        if (!messageId || !fromRaw) continue

        const parsed = parseCloudMessage(message)
        const fromPhone = normalizePhone(fromRaw)
        const profileName = ((contacts.find((c) => (c.wa_id as string) === fromRaw)?.profile as Record<string, unknown> | undefined)?.name as string | undefined) ?? null

        // Detecção de message_echo: a Meta envia em `messages[]` mensagens
        // saídas pelo próprio número quando o app está inscrito em
        // `message_echoes`. Identificamos pelo `from === display_phone_number`.
        const isEcho = displayPhone && fromPhone === displayPhone
        // Destinatário: em echoes, vem em `to` (string); fallback para `from`.
        const toRaw = typeof (message as Record<string, unknown>).to === 'string' ? String((message as Record<string, unknown>).to) : ''
        const peerPhone = isEcho ? normalizePhone(toRaw) : fromPhone

        if (!isEcho) {
          // Bloqueio de eco cross-provider: se o remetente é um número próprio
          // da empresa em outra instância (ex.: Evolution), descarta.
          try {
            const ownNumbers = await getCompanyOwnNumbers(supabase, inst.company_id)
            if (ownNumbers.has(fromPhone)) {
              await log(supabase, {
                company_id: inst.company_id,
                event: 'cloud.echo_skipped',
                provider: 'cloud_api',
                status: 'warning',
                error_message: 'Mensagem ecoada de outra instância da mesma empresa — ignorada',
                metadata: { from: fromPhone, message_id: messageId, instance_name: inst.instance_name },
              })
              continue
            }
          } catch (e) {
            console.error('[cloudHandler] echo check failed:', (e as Error)?.message)
          }
        }

        if (!peerPhone) continue

        // Download de mídia (Cloud API) é assíncrono: enfileiramos um job em
        // `media_fetch_jobs` que será processado pelo worker
        // `process-media-fetch-jobs`. Persistimos a mensagem sem aguardar a
        // mídia para manter o webhook rápido (<50ms no router; pequeno aqui).
        const mediaPath: string | null = null
        const mediaMime: string | null = parsed.mediaMime
        if (parsed.mediaId) {
          try {
            await supabase.rpc('enqueue_media_fetch_job', {
              _company_id: inst.company_id,
              _instance_id: inst.id,
              _message_id: messageId,
              _media_id: parsed.mediaId,
              _media_type: parsed.type,
              _media_mimetype: parsed.mediaMime,
              _provider: 'cloud_api',
            })
          } catch (e) {
            console.error('[cloudHandler] enqueue media job failed:', (e as Error)?.message)
          }
        }

        // Texto de fallback para preview da conversa quando interactive sem content
        const previewText = parsed.content
          ?? (parsed.type === 'interactive' ? '🔘 Mensagem interativa' : null)

        // Upsert conversation
        const { data: conv, error: convErr } = await supabase
          .from('conversations')
          .upsert(
            {
              company_id: inst.company_id,
              instance_name: inst.instance_name,
              instance_id: inst.id,
              provider: 'cloud_api',
              remote_jid: peerPhone,
              phone: peerPhone,
              contact_name: isEcho ? null : profileName,
              last_message_text: previewText,
              last_message_at: timestamp,
            },
            { onConflict: 'company_id,instance_name,remote_jid' },
          )
          .select('id')
          .maybeSingle()

        if (convErr || !conv) {
          await log(supabase, {
            company_id: inst.company_id,
            event: 'cloud.conversation_upsert',
            provider: 'cloud_api',
            status: 'error',
            error_message: convErr?.message ?? 'sem retorno',
          })
          continue
        }

        const { data: chatMsg, error: msgErr } = await supabase
          .from('chat_messages')
          .upsert(
            [{
              company_id: inst.company_id,
              conversation_id: conv.id,
              remote_jid: peerPhone,
              message_id: messageId,
              provider: 'cloud_api',
              provider_message_id: messageId,
              provider_raw_payload: { entry, change },
              webhook_received_at: new Date().toISOString(),
              from_me: isEcho,
              message_type: parsed.type,
              content: parsed.content,
              media_url: null,
              media_mimetype: mediaMime,
              media_storage_path: mediaPath,
              file_name: parsed.fileName,
              link_preview: parsed.linkPreview,
              duration: null,
              status: isEcho ? 'sent' : 'received',
              timestamp,
            }],
            { onConflict: 'company_id,message_id' },
          )
          .select('id')
          .maybeSingle()

        if (msgErr || !chatMsg) {
          await log(supabase, {
            company_id: inst.company_id,
            conversation_id: conv.id,
            event: 'cloud.message_upsert',
            provider: 'cloud_api',
            status: 'error',
            error_message: msgErr?.message ?? 'sem retorno',
          })
          // Enfileira retry para garantir persistência
          try {
            await supabase.rpc('enqueue_webhook_retry', {
              _company_id: inst.company_id,
              _kind: 'persist_message',
              _message_id: messageId,
              _provider: 'cloud_api',
              _payload: {
                company_id: inst.company_id,
                conversation_id: conv.id,
                remote_jid: peerPhone,
                message_id: messageId,
                provider: 'cloud_api',
                provider_message_id: messageId,
                provider_raw_payload: { entry, change },
                webhook_received_at: new Date().toISOString(),
                from_me: isEcho,
                message_type: parsed.type,
                content: parsed.content,
                media_mimetype: mediaMime,
                media_storage_path: mediaPath,
                file_name: parsed.fileName,
                link_preview: parsed.linkPreview,
                status: isEcho ? 'sent' : 'received',
                timestamp,
              },
              _initial_error: msgErr?.message ?? 'unknown',
            })
          } catch (e) {
            console.error('[Cloud retry enqueue] failed:', e)
          }
          continue
        }

        processed++
        lastMessageId = chatMsg.id
        await log(supabase, {
          company_id: inst.company_id,
          conversation_id: conv.id,
          event: isEcho ? 'cloud.echo_persisted' : 'cloud.persisted',
          provider: 'cloud_api',
          status: 'success',
          metadata: { chat_message_id: chatMsg.id, provider_message_id: messageId, message_type: parsed.type, media_id: parsed.mediaId, echo: isEcho },
        })
      }

      // Statuses: usamos para (a) criar stub de mensagens enviadas por fora
      // (ex.: n8n disparando direto na Graph API) quando o status='sent' e
      // não existe ainda chat_message com esse wamid; (b) atualizar ACK
      // para delivered/read via RPC set_chat_message_status.
      const statuses = Array.isArray(value.statuses) ? (value.statuses as Array<Record<string, unknown>>) : []
      for (const st of statuses) {
        const wamid = typeof st.id === 'string' ? st.id : null
        const recipient = normalizePhone(String(st.recipient_id ?? ''))
        const stStatus = String(st.status ?? '').toLowerCase()
        const stTsSec = Number(st.timestamp) || Math.floor(Date.now() / 1000)
        const stTimestamp = new Date(stTsSec * 1000).toISOString()
        if (!wamid || !recipient) continue

        // Verifica existência prévia
        const { data: existing } = await supabase
          .from('chat_messages')
          .select('id, content')
          .eq('company_id', inst.company_id)
          .eq('message_id', wamid)
          .maybeSingle()

        if (!existing && stStatus === 'sent') {
          // Stub: extrai info do template (origin/category) quando disponível
          const conversationMeta = (st.conversation ?? {}) as Record<string, unknown>
          const origin = (conversationMeta.origin ?? {}) as Record<string, unknown>
          const originType = String(origin.type ?? '')
          const tplName = (st.message_template_name as string | undefined)
            ?? ((st as Record<string, unknown>).template as Record<string, unknown> | undefined)?.name as string | undefined
            ?? null
          const tplLang = (st.message_template_language as string | undefined)
            ?? ((st as Record<string, unknown>).template as Record<string, unknown> | undefined)?.language as string | undefined
            ?? null

          let stubContent: string
          let stubType = 'text'
          let stubLinkPreview: Record<string, unknown> | null = null
          let tplFull: HsmFull | null = null
          if (tplName) {
            tplFull = await renderHsmTemplateFull(supabase, inst.company_id, tplName, tplLang)
            stubContent = tplFull?.body ?? `[Template: ${tplName}]`
            stubType = 'interactive'
            stubLinkPreview = {
              type: 'template',
              name: tplName,
              language: tplLang,
              header: tplFull?.header ?? null,
              body: tplFull?.body ?? null,
              footer: tplFull?.footer ?? null,
              buttons: tplFull?.buttons ?? [],
            }
          } else if (originType === 'marketing' || originType === 'utility' || originType === 'authentication') {
            stubContent = `[Mensagem enviada externamente — ${originType}]`
          } else {
            stubContent = '[Mensagem enviada externamente]'
          }

          // Upsert conversation
          const { data: conv } = await supabase
            .from('conversations')
            .upsert(
              {
                company_id: inst.company_id,
                instance_name: inst.instance_name,
                instance_id: inst.id,
                provider: 'cloud_api',
                remote_jid: recipient,
                phone: recipient,
                last_message_text: stubContent,
                last_message_at: stTimestamp,
              },
              { onConflict: 'company_id,instance_name,remote_jid' },
            )
            .select('id')
            .maybeSingle()

          if (conv) {
            const { error: insErr } = await supabase
              .from('chat_messages')
              .upsert(
                [{
                  company_id: inst.company_id,
                  conversation_id: conv.id,
                  remote_jid: recipient,
                  message_id: wamid,
                  provider: 'cloud_api',
                  provider_message_id: wamid,
                  provider_raw_payload: { entry, change, status: st },
                  webhook_received_at: new Date().toISOString(),
                  from_me: true,
                  message_type: stubType,
                  content: stubContent,
                  link_preview: stubLinkPreview,
                  status: 'sent',
                  timestamp: stTimestamp,
                }],
                { onConflict: 'company_id,message_id' },
              )
            await log(supabase, {
              company_id: inst.company_id,
              conversation_id: conv.id,
              event: 'cloud.external_send_stub',
              provider: 'cloud_api',
              status: insErr ? 'error' : 'success',
              error_message: insErr?.message ?? null,
              metadata: { wamid, recipient, template: tplName, origin: originType },
            })
          }
        } else if (existing && (stStatus === 'delivered' || stStatus === 'read' || stStatus === 'sent' || stStatus === 'failed')) {
          // Atualiza ACK preservando rank
          const { error: ackErr } = await supabase.rpc('set_chat_message_status', {
            _message_id: wamid,
            _company_id: inst.company_id,
            _status: stStatus === 'failed' ? 'failed' : stStatus,
          })
          if (ackErr) {
            try {
              await supabase.rpc('enqueue_webhook_retry', {
                _company_id: inst.company_id,
                _kind: 'status_update',
                _message_id: wamid,
                _provider: 'cloud_api',
                _payload: { message_id: wamid, status: stStatus === 'failed' ? 'failed' : stStatus },
                _initial_error: ackErr.message,
              })
            } catch (e) { console.error('[Cloud status retry enqueue]', e) }
          }
        } else if (!existing && (stStatus === 'delivered' || stStatus === 'read')) {
          // Status chegou antes da mensagem ser persistida → enfileira
          try {
            await supabase.rpc('enqueue_webhook_retry', {
              _company_id: inst.company_id,
              _kind: 'status_update',
              _message_id: wamid,
              _provider: 'cloud_api',
              _payload: { message_id: wamid, status: stStatus },
              _initial_error: 'message_not_found_yet',
            })
          } catch (e) { console.error('[Cloud status retry enqueue]', e) }
        }
      }
      if (statuses.length) {
        await log(supabase, {
          company_id: inst.company_id,
          event: 'cloud.statuses',
          provider: 'cloud_api',
          status: 'success',
          metadata: { count: statuses.length, sample: statuses[0] },
        })
      }
    }
  }

  return { processed, messageId: lastMessageId, ignored: processed === 0 ? 'no_messages' : undefined }
}
