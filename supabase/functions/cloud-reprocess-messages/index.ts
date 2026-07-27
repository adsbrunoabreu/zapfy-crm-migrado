/**
 * cloud-reprocess-messages
 * ------------------------
 * Reprocessa mensagens do provider `cloud_api` que ficaram com conteúdo
 * ausente ou stub `[Mensagem enviada externamente]` / `[Template: ...]`,
 * tentando recuperar texto real a partir de:
 *
 *  1. `provider_raw_payload` (quando contém `text.body` original).
 *  2. Re-render do body de templates HSM via `whatsapp_hsm_templates`
 *     (caso o template tenha sido cadastrado depois).
 *
 * Também marca mensagens `pending` há mais de 5 minutos como `failed`,
 * limpando UI de spinners eternos.
 *
 * Escopo: a função opera apenas dentro da empresa do usuário autenticado
 * (RLS aplicada via cliente JWT do solicitante). Master pode informar
 * `company_id` no body para reprocessar qualquer empresa.
 *
 * Body opcional: { company_id?: string, instance_id?: string, dry_run?: boolean }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const STUB_PATTERNS = [
  /^\[Mensagem enviada externamente\]?/i,
  /^\[Template:\s*[^\]]+\]/i,
]

const MAX_BATCH = 500
const PENDING_TIMEOUT_MIN = 5

interface ChatRow {
  id: string
  company_id: string
  conversation_id: string
  message_id: string
  content: string | null
  message_type: string
  status: string
  timestamp: string
  provider_raw_payload: Record<string, unknown> | null
}

function isStub(content: string | null): boolean {
  if (!content) return true
  return STUB_PATTERNS.some((re) => re.test(content.trim()))
}

/**
 * Tenta extrair texto real do raw payload da Meta.
 * Suporta tanto webhook de status (sem texto) como echo de mensagens
 * recebidas/enviadas (text.body, button.text, interactive.*reply.title).
 */
function extractTextFromRaw(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null

  // Pode estar wrappeado em { entry, change, status } (caso do stub)
  // ou { text: { body: ... } } (caso de echo).
  const candidates: Array<Record<string, unknown> | undefined> = [
    raw,
    raw.message as Record<string, unknown> | undefined,
    raw.status as Record<string, unknown> | undefined,
    ((raw.change as Record<string, unknown> | undefined)?.value as Record<string, unknown> | undefined),
  ]

  for (const node of candidates) {
    if (!node) continue
    const text = (node.text as Record<string, unknown> | undefined)?.body
    if (typeof text === 'string' && text.trim()) return text.trim()
    const btn = (node.button as Record<string, unknown> | undefined)?.text
    if (typeof btn === 'string' && btn.trim()) return btn.trim()
    const interactive = node.interactive as Record<string, unknown> | undefined
    if (interactive) {
      const br = (interactive.button_reply as Record<string, unknown> | undefined)?.title
      if (typeof br === 'string' && br.trim()) return br.trim()
      const lr = (interactive.list_reply as Record<string, unknown> | undefined)?.title
      if (typeof lr === 'string' && lr.trim()) return lr.trim()
    }
  }
  return null
}

/**
 * Tenta encontrar nome de template no raw payload (status webhook da Meta).
 */
function extractTemplateName(raw: Record<string, unknown> | null, fallbackContent: string | null): { name: string | null; lang: string | null } {
  if (raw) {
    const status = raw.status as Record<string, unknown> | undefined
    const tplName = (status?.message_template_name as string | undefined)
      ?? ((status?.template as Record<string, unknown> | undefined)?.name as string | undefined)
      ?? null
    const tplLang = (status?.message_template_language as string | undefined)
      ?? ((status?.template as Record<string, unknown> | undefined)?.language as string | undefined)
      ?? null
    if (tplName) return { name: tplName, lang: tplLang }
  }
  // Tenta recuperar do próprio stub: "[Template: nome]"
  if (fallbackContent) {
    const m = /^\[Template:\s*([^\]]+)\]/i.exec(fallbackContent.trim())
    if (m) return { name: m[1].trim(), lang: null }
  }
  return { name: null, lang: null }
}

interface HsmFull {
  header: { format: string; text?: string; url?: string | null } | null
  body: string | null
  footer: string | null
  buttons: Array<{ type: string; display_text: string; url?: string | null; phone_number?: string | null }>
}

async function renderHsmFull(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  templateName: string,
  language: string | null,
): Promise<HsmFull | null> {
  let q = supabase
    .from('whatsapp_hsm_templates')
    .select('components, language')
    .eq('company_id', companyId)
    .eq('name', templateName)
    .limit(1)
  if (language) q = q.eq('language', language)
  const { data } = await q.maybeSingle()
  if (!data) return null
  const components = ((data as Record<string, unknown>).components ?? []) as Array<Record<string, unknown>>
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
    } else if (t === 'BODY') body = String(comp.text ?? '') || null
    else if (t === 'FOOTER') footer = String(comp.text ?? '') || null
    else if (t === 'BUTTONS') {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Cliente para resolver o usuário autenticado
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const body = await req.json().catch(() => ({})) as {
    company_id?: string
    instance_id?: string
    dry_run?: boolean
  }

  // Resolve company_id alvo: se body.company_id != company do user, exige Master
  const { data: profile } = await userClient
    .from('profiles')
    .select('company_id')
    .eq('id', userData.user.id)
    .maybeSingle()

  let targetCompanyId = body.company_id ?? profile?.company_id ?? null
  if (!targetCompanyId) {
    return new Response(JSON.stringify({ error: 'company_not_resolved' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (body.company_id && body.company_id !== profile?.company_id) {
    const { data: isMaster } = await userClient.rpc('is_master', { _user_id: userData.user.id })
    if (!isMaster) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  // Cliente service-role para escrever (já validamos escopo acima)
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // ── 1. Buscar candidatos ────────────────────────────────────────────────
  let q = admin
    .from('chat_messages')
    .select('id, company_id, conversation_id, message_id, content, message_type, status, timestamp, provider_raw_payload')
    .eq('company_id', targetCompanyId)
    .eq('provider', 'cloud_api')
    .eq('from_me', true)
    .order('timestamp', { ascending: false })
    .limit(MAX_BATCH)

  if (body.instance_id) {
    // filtra por conversa da instância
    const { data: convs } = await admin
      .from('conversations')
      .select('id')
      .eq('company_id', targetCompanyId)
      .eq('instance_id', body.instance_id)
      .limit(2000)
    const ids = (convs ?? []).map((c) => (c as { id: string }).id)
    if (ids.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: 0, recovered: 0, failed_pending: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    q = q.in('conversation_id', ids)
  }

  const { data: rows, error: rowsErr } = await q
  if (rowsErr) {
    return new Response(JSON.stringify({ error: rowsErr.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const candidates = (rows ?? []) as ChatRow[]
  let recovered = 0
  let failedPending = 0
  const recoveredSamples: Array<{ message_id: string; before: string | null; after: string }> = []
  const pendingCutoff = Date.now() - PENDING_TIMEOUT_MIN * 60 * 1000

  for (const row of candidates) {
    // (a) pending há > N min → failed
    if (row.status === 'pending' && new Date(row.timestamp).getTime() < pendingCutoff) {
      if (!body.dry_run) {
        await admin
          .from('chat_messages')
          .update({ status: 'failed', sync_error: 'Timeout: status pending por mais de 5 min' })
          .eq('id', row.id)
      }
      failedPending++
      continue
    }

    // (b) recuperar texto se for stub
    if (!isStub(row.content)) continue

    let newContent: string | null = extractTextFromRaw(row.provider_raw_payload)
    let source = 'raw_payload'
    let tplFull: HsmFull | null = null
    let tplMeta: { name: string; lang: string | null } | null = null

    if (!newContent) {
      const { name: tplName, lang: tplLang } = extractTemplateName(row.provider_raw_payload, row.content)
      if (tplName) {
        tplFull = await renderHsmFull(admin, row.company_id, tplName, tplLang)
        if (tplFull?.body) {
          newContent = tplFull.body
          source = 'hsm_template'
          tplMeta = { name: tplName, lang: tplLang }
        }
      }
    }

    if (!newContent || newContent === row.content) continue

    if (!body.dry_run) {
      const updates: Record<string, unknown> = { content: newContent }
      if (tplFull && tplMeta) {
        updates.message_type = 'interactive'
        updates.link_preview = {
          type: 'template',
          name: tplMeta.name,
          language: tplMeta.lang,
          header: tplFull.header,
          body: tplFull.body,
          footer: tplFull.footer,
          buttons: tplFull.buttons,
        }
      }
      await admin
        .from('chat_messages')
        .update(updates)
        .eq('id', row.id)

      // Atualiza preview da conversa quando esta era a última
      const { data: conv } = await admin
        .from('conversations')
        .select('id, last_message_at')
        .eq('id', row.conversation_id)
        .maybeSingle()
      if (conv && new Date((conv as { last_message_at: string | null }).last_message_at ?? 0).getTime() <= new Date(row.timestamp).getTime()) {
        await admin
          .from('conversations')
          .update({ last_message_text: newContent })
          .eq('id', row.conversation_id)
      }
    }

    recovered++
    if (recoveredSamples.length < 5) {
      recoveredSamples.push({ message_id: row.message_id, before: row.content, after: newContent })
    }
    void source
  }

  // ── 2. Backfill de mídia: enfileira download para mensagens cloud_api
  //     com media_mimetype preenchido mas sem media_storage_path.
  let mediaEnqueued = 0
  {
    const { data: noMedia } = await admin
      .from('chat_messages')
      .select('id, message_id, message_type, media_mimetype, conversation_id, timestamp')
      .eq('company_id', targetCompanyId)
      .eq('provider', 'cloud_api')
      .not('media_mimetype', 'is', null)
      .is('media_storage_path', null)
      .gte('timestamp', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(200)

    const rows = (noMedia ?? []) as Array<{
      message_id: string
      message_type: string
      media_mimetype: string | null
      conversation_id: string
    }>

    if (rows.length && !body.dry_run) {
      const convIds = Array.from(new Set(rows.map((r) => r.conversation_id)))
      const { data: convs } = await admin
        .from('conversations')
        .select('id, instance_id')
        .in('id', convIds)
      const instanceByConv = new Map<string, string>()
      for (const c of (convs ?? []) as Array<{ id: string; instance_id: string | null }>) {
        if (c.instance_id) instanceByConv.set(c.id, c.instance_id)
      }

      // Para usar o media_id real, lemos o raw payload de cada mensagem
      for (const r of rows) {
        const instanceId = instanceByConv.get(r.conversation_id)
        if (!instanceId) continue

        const { data: full } = await admin
          .from('chat_messages')
          .select('provider_raw_payload')
          .eq('id', (r as any).id)
          .maybeSingle()
        const raw = (full?.provider_raw_payload ?? null) as Record<string, unknown> | null
        const change = raw?.change as Record<string, unknown> | undefined
        const value = change?.value as Record<string, unknown> | undefined
        const messages = (value?.messages ?? []) as Array<Record<string, unknown>>
        const msg = messages[0] ?? {}
        const node = (msg[r.message_type] ?? {}) as Record<string, unknown>
        const mediaId = (node.id as string | undefined) ?? null
        if (!mediaId) continue

        try {
          await admin.rpc('enqueue_webhook_retry', {
            _company_id: targetCompanyId,
            _kind: 'download_media',
            _message_id: r.message_id,
            _provider: 'cloud_api',
            _payload: {
              media_id: mediaId,
              media_type: r.message_type,
              media_mimetype: r.media_mimetype,
              instance_id: instanceId,
            },
            _initial_error: 'backfill',
          })
          mediaEnqueued++
        } catch (_) { /* ignore */ }
      }
    }
  }

  // Auditoria
  await admin.from('message_sync_log').insert({
    company_id: targetCompanyId,
    event: 'cloud.reprocess_messages',
    provider: 'cloud_api',
    status: 'success',
    metadata: {
      scanned: candidates.length,
      recovered,
      failed_pending: failedPending,
      media_enqueued: mediaEnqueued,
      dry_run: body.dry_run ?? false,
      samples: recoveredSamples,
    },
  })

  return new Response(
    JSON.stringify({
      ok: true,
      scanned: candidates.length,
      recovered,
      failed_pending: failedPending,
      media_enqueued: mediaEnqueued,
      samples: recoveredSamples,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
