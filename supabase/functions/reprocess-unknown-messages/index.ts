/**
 * reprocess-unknown-messages
 * --------------------------
 * Backfill para mensagens persistidas como `message_type='unknown'` (ou sem
 * `link_preview`) antes do parser interativo ser reforçado. Recalcula
 * `message_type`, `content` e `link_preview` a partir de
 * `provider_raw_payload` e atualiza `conversations.last_message_text`
 * quando a mensagem ainda é a última da conversa.
 *
 * Body opcional: {
 *   company_id?: string,        // Master pode informar empresa específica
 *   provider?: 'evolution' | 'cloud_api' | 'all',
 *   limit?: number,             // default 500, max 2000
 *   only_unknown?: boolean,     // default true
 *   dry_run?: boolean,
 * }
 *
 * Escopo: usuário autenticado precisa ser admin/master da empresa alvo.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_LIMIT = 2000
const DEFAULT_LIMIT = 500

// ─────────────────────────────────────────────────────────────────────────────
// Parsers (espelho dos handlers em process-webhook-inbox)
// ─────────────────────────────────────────────────────────────────────────────

interface Detected {
  type: string
  content: string | null
  linkPreview: Record<string, unknown> | null
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
function sanitizeText(s: unknown, max = 4096): string {
  if (typeof s !== 'string') return ''
  return s.replace(/\u0000/g, '').slice(0, max)
}
function sanitizeShort(s: unknown, max = 128): string | null {
  if (typeof s !== 'string') return null
  const v = s.replace(/\u0000/g, '').trim().slice(0, max)
  return v || null
}

function detectEvolution(message: Record<string, unknown>): Detected {
  const get = (k: string) => message[k] as Record<string, unknown> | undefined

  if (typeof message.conversation === 'string') {
    return { type: 'text', content: message.conversation, linkPreview: null }
  }
  if (get('extendedTextMessage')) {
    return { type: 'text', content: pickString(get('extendedTextMessage'), 'text'), linkPreview: null }
  }
  if (get('imageMessage')) return { type: 'image', content: pickString(get('imageMessage'), 'caption'), linkPreview: null }
  if (get('videoMessage')) return { type: 'video', content: pickString(get('videoMessage'), 'caption'), linkPreview: null }
  if (get('audioMessage')) return { type: 'audio', content: null, linkPreview: null }
  if (get('documentMessage')) return { type: 'document', content: pickString(get('documentMessage'), 'caption'), linkPreview: null }
  if (get('stickerMessage')) return { type: 'sticker', content: null, linkPreview: null }
  if (get('locationMessage')) return { type: 'location', content: '[location]', linkPreview: null }
  if (get('contactMessage') || get('contactsArrayMessage')) return { type: 'contact', content: '[contact]', linkPreview: null }
  if (get('reactionMessage')) return { type: 'reaction', content: pickString(get('reactionMessage'), 'text'), linkPreview: null }

  // Interativas inbound
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
    return { type: 'interactive', content, linkPreview }
  }

  const btnMsg = get('buttonsMessage') as any
  if (btnMsg) {
    const content = sanitizeText(btnMsg.contentText || '[Mensagem com botões]')
    let linkPreview: Record<string, unknown> | null = null
    if (Array.isArray(btnMsg.buttons)) {
      linkPreview = { type: 'buttons', buttons: btnMsg.buttons.map((btn: any) => ({ type: 'quick_reply', display_text: sanitizeShort(btn.buttonText?.displayText || 'Botão', 80), url: null, id: sanitizeShort(btn.buttonId || '', 128) })) }
    }
    return { type: 'interactive', content, linkPreview }
  }

  const listMsg = get('listMessage') as any
  if (listMsg) {
    const content = sanitizeText(listMsg.description ?? listMsg.title ?? '[Selecione uma opção]')
    const options: any[] = []
    if (Array.isArray(listMsg.sections)) {
      for (const section of listMsg.sections) {
        if (Array.isArray(section.rows)) {
          for (const row of section.rows) {
            options.push({ id: sanitizeShort(row.rowId || '', 128), title: sanitizeShort(row.title || 'Opção', 80), description: sanitizeShort(row.description || '', 200) })
          }
        }
      }
    }
    return { type: 'interactive', content, linkPreview: { type: 'list', button_text: sanitizeShort(listMsg.buttonText, 80) || 'Ver opções', options } }
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
    return { type: 'interactive', content, linkPreview }
  }

  // Respostas → texto
  const btnResp = get('buttonsResponseMessage') as any
  if (btnResp) return { type: 'text', content: sanitizeText(btnResp.selectedDisplayText || 'Opção selecionada'), linkPreview: null }
  const listResp = get('listResponseMessage') as any
  if (listResp) return { type: 'text', content: sanitizeText(listResp.title ?? listResp.singleSelectReply?.selectedRowId ?? 'Opção selecionada'), linkPreview: null }
  const tplResp = get('templateButtonReplyMessage') as any
  if (tplResp) return { type: 'text', content: sanitizeText(tplResp.selectedDisplayText || 'Opção'), linkPreview: null }
  const intResp = get('interactiveResponseMessage') as any
  if (intResp) {
    let parsed: any = null
    try { parsed = JSON.parse(intResp.nativeFlowResponseMessage?.paramsJson || '{}') } catch { /* ignore */ }
    return { type: 'text', content: sanitizeText(parsed?.id ?? parsed?.display_text ?? intResp.body?.text ?? 'Resposta recebida'), linkPreview: null }
  }
  const flowResp = get('nativeFlowResponseMessage') as any
  if (flowResp) {
    let parsed: any = null
    try { parsed = JSON.parse(flowResp.paramsJson || '{}') } catch { /* ignore */ }
    return { type: 'text', content: sanitizeText(parsed?.id ?? parsed?.display_text ?? flowResp.body?.text ?? 'Resposta recebida'), linkPreview: null }
  }

  return { type: 'unknown', content: null, linkPreview: null }
}

function parseCloud(message: Record<string, unknown>): Detected {
  const t = String(message.type ?? '')
  const m = (k: string) => message[k] as Record<string, unknown> | undefined
  switch (t) {
    case 'text': return { type: 'text', content: (m('text')?.body as string) ?? null, linkPreview: null }
    case 'image': return { type: 'image', content: (m('image')?.caption as string) ?? null, linkPreview: null }
    case 'video': return { type: 'video', content: (m('video')?.caption as string) ?? null, linkPreview: null }
    case 'audio': return { type: 'audio', content: null, linkPreview: null }
    case 'document': return { type: 'document', content: (m('document')?.caption as string) ?? null, linkPreview: null }
    case 'sticker': return { type: 'sticker', content: null, linkPreview: null }
    case 'location': {
      const loc = m('location') ?? {}
      const lat = (loc as Record<string, unknown>).latitude
      const lng = (loc as Record<string, unknown>).longitude
      const name = (loc as Record<string, unknown>).name as string | undefined
      const addr = (loc as Record<string, unknown>).address as string | undefined
      return { type: 'location', content: name || addr || '[location]', linkPreview: { type: 'location', latitude: lat, longitude: lng, name: name ?? null, address: addr ?? null } }
    }
    case 'contacts': return { type: 'contact', content: '[contact]', linkPreview: null }
    case 'reaction': return { type: 'reaction', content: (m('reaction')?.emoji as string) ?? null, linkPreview: null }
    case 'interactive': {
      const inter = (m('interactive') ?? {}) as Record<string, unknown>
      const itype = String(inter.type ?? '')
      if (itype === 'button_reply') {
        const br = (inter.button_reply ?? {}) as Record<string, unknown>
        return { type: 'text', content: sanitizeShort(br.title, 1024) || sanitizeShort(br.id, 128) || 'Opção selecionada', linkPreview: null }
      }
      if (itype === 'list_reply') {
        const lr = (inter.list_reply ?? {}) as Record<string, unknown>
        const title = sanitizeShort(lr.title, 1024)
        const desc = sanitizeShort(lr.description, 1024)
        const txt = title ? (desc ? `${title} — ${desc}` : title) : sanitizeShort(lr.id, 128) || 'Opção selecionada'
        return { type: 'text', content: txt, linkPreview: null }
      }
      if (itype === 'nfm_reply') {
        const nfm = (inter.nfm_reply ?? {}) as Record<string, unknown>
        return { type: 'text', content: sanitizeShort(nfm.body, 1024) || sanitizeShort(nfm.name, 128) || 'Resposta de Flow', linkPreview: null }
      }
      return { type: 'interactive', content: '[Mensagem interativa]', linkPreview: { type: 'interactive_raw', interactive: inter } }
    }
    case 'button': {
      const btn = (m('button') ?? {}) as Record<string, unknown>
      return { type: 'text', content: sanitizeShort(btn.text, 1024) || sanitizeShort(btn.payload, 256) || 'Opção selecionada', linkPreview: null }
    }
    case 'order': {
      const order = (m('order') ?? {}) as Record<string, unknown>
      const items = Array.isArray(order.product_items) ? (order.product_items as Array<Record<string, unknown>>) : []
      return { type: 'interactive', content: (order.text as string) ?? `[Pedido com ${items.length} item(ns)]`, linkPreview: { type: 'order', catalog_id: order.catalog_id ?? null, product_items: items, text: order.text ?? null } }
    }
    case 'system': return { type: 'text', content: ((m('system') ?? {}) as Record<string, unknown>).body as string ?? '[mensagem do sistema]', linkPreview: null }
    case 'unsupported': return { type: 'unknown', content: '[mensagem não suportada]', linkPreview: null }
    default: return { type: 'unknown', content: null, linkPreview: null }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  company_id: string
  conversation_id: string
  message_id: string
  provider: 'evolution' | 'cloud_api' | string
  message_type: string
  content: string | null
  link_preview: Record<string, unknown> | null
  timestamp: string
  provider_raw_payload: Record<string, unknown> | null
}

function extractEvolutionMessage(raw: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!raw) return null
  const data = raw.data as Record<string, unknown> | undefined
  const msg = data?.message as Record<string, unknown> | undefined
  if (msg && typeof msg === 'object') return msg
  if (raw.conversation || raw.extendedTextMessage) return raw
  return null
}

function extractCloudMessage(raw: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!raw) return null
  const change = raw.change as Record<string, unknown> | undefined
  const value = change?.value as Record<string, unknown> | undefined
  const messages = value?.messages as Array<Record<string, unknown>> | undefined
  if (Array.isArray(messages) && messages.length > 0) return messages[0]
  if (typeof raw.type === 'string') return raw
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const body = await req.json().catch(() => ({})) as {
    company_id?: string
    provider?: 'evolution' | 'cloud_api' | 'all'
    limit?: number
    only_unknown?: boolean
    dry_run?: boolean
  }

  const { data: profile } = await userClient
    .from('profiles')
    .select('company_id')
    .eq('id', userData.user.id)
    .maybeSingle()

  const userCompany = (profile as { company_id: string | null } | null)?.company_id ?? null
  const targetCompanyId = body.company_id ?? userCompany ?? null
  if (!targetCompanyId) {
    return new Response(JSON.stringify({ error: 'company_not_resolved' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const { data: isMasterRow } = await userClient.rpc('is_master', { _user_id: userData.user.id })
  const isMaster = Boolean(isMasterRow)
  if (body.company_id && body.company_id !== userCompany && !isMaster) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!isMaster) {
    const { data: isAdmin } = await userClient.rpc('has_role', { _user_id: userData.user.id, _role: 'admin' })
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const limit = Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)
  const onlyUnknown = body.only_unknown !== false
  const provider = body.provider ?? 'all'

  let q = admin
    .from('chat_messages')
    .select('id, company_id, conversation_id, message_id, provider, message_type, content, link_preview, timestamp, provider_raw_payload')
    .eq('company_id', targetCompanyId)
    .not('provider_raw_payload', 'is', null)
    .order('timestamp', { ascending: false })
    .limit(limit)

  if (provider !== 'all') q = q.eq('provider', provider)
  if (onlyUnknown) q = q.eq('message_type', 'unknown')
  else q = q.in('message_type', ['unknown', 'interactive'])

  const { data: rows, error: rowsErr } = await q
  if (rowsErr) {
    return new Response(JSON.stringify({ error: rowsErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const candidates = (rows ?? []) as Row[]
  let scanned = 0
  let updated = 0
  let unrecoverable = 0
  const samples: Array<{ message_id: string; provider: string; before: string; after: string; type: string }> = []

  for (const row of candidates) {
    scanned++
    let det: Detected | null = null

    if (row.provider === 'evolution') {
      const msg = extractEvolutionMessage(row.provider_raw_payload)
      if (msg) det = detectEvolution(msg)
    } else if (row.provider === 'cloud_api') {
      const msg = extractCloudMessage(row.provider_raw_payload)
      if (msg) det = parseCloud(msg)
    }

    if (!det || det.type === 'unknown') { unrecoverable++; continue }

    const sameType = det.type === row.message_type
    const sameContent = (det.content ?? null) === (row.content ?? null)
    const samePreview = JSON.stringify(det.linkPreview ?? null) === JSON.stringify(row.link_preview ?? null)
    if (sameType && sameContent && samePreview) continue

    const previewText = det.content ?? (det.type === 'interactive' ? '🔘 Mensagem interativa' : null)

    if (!body.dry_run) {
      const { error: upErr } = await admin
        .from('chat_messages')
        .update({ message_type: det.type, content: det.content, link_preview: det.linkPreview })
        .eq('id', row.id)
      if (upErr) {
        console.error('[reprocess-unknown] update failed', row.id, upErr.message)
        continue
      }

      const { data: conv } = await admin
        .from('conversations')
        .select('last_message_at')
        .eq('id', row.conversation_id)
        .maybeSingle()
      const lastAt = (conv as { last_message_at: string | null } | null)?.last_message_at ?? null
      if (lastAt && new Date(lastAt).getTime() <= new Date(row.timestamp).getTime() + 1000) {
        await admin
          .from('conversations')
          .update({ last_message_text: previewText })
          .eq('id', row.conversation_id)
      }
    }

    updated++
    if (samples.length < 10) {
      samples.push({
        message_id: row.message_id,
        provider: row.provider,
        before: `${row.message_type}/${row.content ?? ''}`.slice(0, 120),
        after: `${det.type}/${det.content ?? ''}`.slice(0, 120),
        type: det.type,
      })
    }
  }

  await admin.from('message_sync_log').insert({
    company_id: targetCompanyId,
    event: 'reprocess.unknown_messages',
    provider: provider === 'all' ? 'unknown' : provider,
    status: 'success',
    metadata: { scanned, updated, unrecoverable, dry_run: body.dry_run ?? false, only_unknown: onlyUnknown, samples },
  })

  return new Response(
    JSON.stringify({ ok: true, scanned, updated, unrecoverable, dry_run: body.dry_run ?? false, samples }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
