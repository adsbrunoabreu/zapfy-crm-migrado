// Edge function chamada por triggers/cron para enviar mensagens automáticas
// (off-hours, welcome, wait_time) usando a instância WhatsApp da própria empresa.
// Autenticação: header x-internal-key === SUPABASE_SERVICE_ROLE_KEY
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
}

const normalizeUrl = (raw: string) => raw.trim().replace(/\/+$/, '')

interface Payload {
  conversation_id: string
  kind: 'off_hours' | 'welcome' | 'wait_time'
  body?: string
  variables?: Record<string, string>
  origin?: string
  queue_id?: string
}

const renderVars = (template: string, vars: Record<string, string> = {}) =>
  template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => vars[k] ?? '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

  // Auth: requer service key no header (chamado internamente)
  const internalKey = req.headers.get('x-internal-key') || ''
  if (internalKey !== SERVICE_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  const audit = async (
    company_id: string | null,
    level: 'info' | 'warn' | 'error' | 'debug',
    event: string,
    message: string,
    metadata: Record<string, unknown> = {}
  ) => {
    try {
      await admin.from('system_logs').insert({
        company_id,
        source: 'attendance_auto',
        level,
        event,
        message,
        metadata: { ...metadata, origin: 'edge_function:attendance-auto-reply' },
      })
    } catch (_) {}
  }

  // Snapshot dos flags de automação para detectar phantoms
  const getFlagsSnapshot = (settings: any, kind: string) => {
    const bh = settings?.business_hours || {}
    const gen = settings?.general || {}
    const off = Boolean(bh?.off_hours_enabled)
    const welcome = Boolean(gen?.welcome_message && String(gen.welcome_message).trim().length > 0)
    const wait = Boolean(gen?.show_wait_time)
    const enabledNow =
      kind === 'off_hours' ? off : kind === 'welcome' ? welcome : kind === 'wait_time' ? wait : true
    return { off, welcome, wait, enabledNow }
  }

  const recordAttempt = async (params: {
    company_id: string | null
    conversation_id: string | null
    queue_id?: string | null
    kind: string
    phase: 'started' | 'skipped' | 'sent' | 'failed'
    origin: string
    flags?: { off?: boolean; welcome?: boolean; wait?: boolean; enabledNow?: boolean }
    skip_reason?: string | null
    http_status?: number | null
    evolution_response?: unknown
    body_preview?: string | null
    instance_name?: string | null
    error_message?: string | null
    metadata?: Record<string, unknown>
  }) => {
    try {
      const enabledNow = params.flags?.enabledNow
      // Phantom = fase final (sent/skipped sem motivo bloqueador) com a feature DESATIVADA no momento
      const isPhantom =
        enabledNow === false &&
        (params.phase === 'sent' ||
          (params.phase === 'skipped' &&
            params.skip_reason !== 'off_hours_disabled' &&
            params.skip_reason !== 'welcome_disabled' &&
            params.skip_reason !== 'wait_time_disabled'))
      await admin.from('attendance_auto_send_attempts').insert({
        company_id: params.company_id,
        conversation_id: params.conversation_id,
        queue_id: params.queue_id ?? null,
        message_kind: params.kind,
        phase: params.phase,
        origin: params.origin,
        off_hours_enabled: params.flags?.off ?? null,
        welcome_enabled: params.flags?.welcome ?? null,
        wait_time_enabled: params.flags?.wait ?? null,
        feature_enabled_now: enabledNow ?? null,
        is_phantom: isPhantom,
        skip_reason: params.skip_reason ?? null,
        http_status: params.http_status ?? null,
        evolution_response: params.evolution_response ?? null,
        body_preview: params.body_preview ?? null,
        instance_name: params.instance_name ?? null,
        error_message: params.error_message ?? null,
        metadata: params.metadata ?? {},
      })
    } catch (_) {}
  }

  let conversationId: string | null = null
  let kindForLog: string | null = null
  let companyForLog: string | null = null
  let originForLog = 'edge_function:attendance-auto-reply'
  let queueIdForLog: string | null = null
  try {
    const payload = (await req.json()) as Payload
    if (!payload?.conversation_id || !payload?.kind) {
      throw new Error('conversation_id e kind são obrigatórios')
    }
    conversationId = payload.conversation_id
    kindForLog = payload.kind
    originForLog = payload.origin || originForLog
    queueIdForLog = payload.queue_id || null

    // Busca conversa
    const { data: conv, error: convErr } = await admin
      .from('conversations')
      .select('id, company_id, phone, instance_name')
      .eq('id', payload.conversation_id)
      .maybeSingle()
    if (convErr || !conv) throw new Error('Conversa não encontrada')
    companyForLog = conv.company_id

    // Pega configurações para snapshot e resolver body
    const { data: settings } = await admin
      .from('attendance_settings')
      .select('general, business_hours')
      .eq('company_id', conv.company_id)
      .maybeSingle()

    const flags = getFlagsSnapshot(settings, payload.kind)

    // Registra "started" com snapshot
    await recordAttempt({
      company_id: conv.company_id,
      conversation_id: conv.id,
      queue_id: queueIdForLog,
      kind: payload.kind,
      phase: 'started',
      origin: originForLog,
      flags,
    })

    // Anti-duplicação: já enviou esse tipo nas últimas 6h?
    const cutoff = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
    const { data: recent } = await admin
      .from('attendance_auto_messages')
      .select('id')
      .eq('conversation_id', conv.id)
      .eq('message_kind', payload.kind)
      .gte('sent_at', cutoff)
      .limit(1)
      .maybeSingle()
    if (recent) {
      await audit(conv.company_id, 'info', 'skipped', `Skip: já enviado ${payload.kind} nas últimas 6h`, { conversation_id: conv.id, kind: payload.kind, reason: 'recent_duplicate' })
      await recordAttempt({ company_id: conv.company_id, conversation_id: conv.id, queue_id: queueIdForLog, kind: payload.kind, phase: 'skipped', origin: originForLog, flags, skip_reason: 'recent_duplicate' })
      return new Response(JSON.stringify({ skipped: 'recent_duplicate' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Re-checa flags em runtime (defesa contra phantoms)
    if (payload.kind === 'off_hours' && !flags.off) {
      await audit(conv.company_id, 'warn', 'skipped', 'Skip off_hours: desativado nas configurações', { conversation_id: conv.id, kind: 'off_hours', reason: 'off_hours_disabled' })
      await recordAttempt({ company_id: conv.company_id, conversation_id: conv.id, queue_id: queueIdForLog, kind: payload.kind, phase: 'skipped', origin: originForLog, flags, skip_reason: 'off_hours_disabled' })
      return new Response(JSON.stringify({ skipped: 'off_hours_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (payload.kind === 'welcome' && !flags.welcome) {
      await audit(conv.company_id, 'warn', 'skipped', 'Skip welcome: desativado', { conversation_id: conv.id, kind: 'welcome', reason: 'welcome_disabled' })
      await recordAttempt({ company_id: conv.company_id, conversation_id: conv.id, queue_id: queueIdForLog, kind: payload.kind, phase: 'skipped', origin: originForLog, flags, skip_reason: 'welcome_disabled' })
      return new Response(JSON.stringify({ skipped: 'welcome_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (payload.kind === 'wait_time' && !flags.wait) {
      await audit(conv.company_id, 'warn', 'skipped', 'Skip wait_time: desativado', { conversation_id: conv.id, kind: 'wait_time', reason: 'wait_time_disabled' })
      await recordAttempt({ company_id: conv.company_id, conversation_id: conv.id, queue_id: queueIdForLog, kind: payload.kind, phase: 'skipped', origin: originForLog, flags, skip_reason: 'wait_time_disabled' })
      return new Response(JSON.stringify({ skipped: 'wait_time_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body = payload.body || ''
    if (!body) {
      if (payload.kind === 'off_hours') {
        body = (settings?.business_hours as any)?.off_hours_message || ''
      } else if (payload.kind === 'welcome') {
        body = (settings?.general as any)?.welcome_message || ''
      } else if (payload.kind === 'wait_time') {
        const minutes = payload.variables?.minutes || '5'
        body = `Você está na fila. Tempo estimado de espera: ${minutes} minutos.`
      }
    }
    if (payload.variables) body = renderVars(body, payload.variables)
    if (!body?.trim()) {
      await audit(conv.company_id, 'warn', 'skipped', 'Skip: corpo vazio', { conversation_id: conv.id, kind: payload.kind, reason: 'empty_body' })
      await recordAttempt({ company_id: conv.company_id, conversation_id: conv.id, queue_id: queueIdForLog, kind: payload.kind, phase: 'skipped', origin: originForLog, flags, skip_reason: 'empty_body' })
      return new Response(JSON.stringify({ skipped: 'empty_body' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve instância da empresa
    let instanceName = conv.instance_name
    if (!instanceName) {
      const { data: inst } = await admin
        .from('whatsapp_instances')
        .select('instance_name')
        .eq('company_id', conv.company_id)
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle()
      instanceName = inst?.instance_name || null
      if (!instanceName) {
        const { data: anyInst } = await admin
          .from('whatsapp_instances')
          .select('instance_name')
          .eq('company_id', conv.company_id)
          .limit(1)
          .maybeSingle()
        instanceName = anyInst?.instance_name || null
      }
    }
    if (!instanceName) throw new Error('Nenhuma instância WhatsApp para esta empresa')

    const EVO_URL = normalizeUrl(
      Deno.env.get('EVOLUTION_MASTER_URL') || Deno.env.get('EVOLUTION_API_URL') || ''
    )
    const EVO_KEY =
      Deno.env.get('EVOLUTION_MASTER_API_KEY') || Deno.env.get('EVOLUTION_API_KEY') || ''
    if (!EVO_URL || !EVO_KEY) throw new Error('Evolution não configurada')

    const resp = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: EVO_KEY },
      body: JSON.stringify({ number: conv.phone, text: body, delay: 800 }),
    })
    const result = await resp.json().catch(() => ({}))

    if (!resp.ok) {
      console.error('Evolution send failed', { status: resp.status, body: result })
      await audit(conv.company_id, 'error', 'send_failed', `Evolution retornou ${resp.status}`, { conversation_id: conv.id, kind: payload.kind, status: resp.status, response: result, instance: instanceName })
      await recordAttempt({ company_id: conv.company_id, conversation_id: conv.id, queue_id: queueIdForLog, kind: payload.kind, phase: 'failed', origin: originForLog, flags, http_status: resp.status, evolution_response: result, instance_name: instanceName, body_preview: body.slice(0, 200), error_message: `Evolution ${resp.status}` })
      throw new Error(`Evolution: ${resp.status}`)
    }

    // Registra envio
    await admin.from('attendance_auto_messages').insert({
      company_id: conv.company_id,
      conversation_id: conv.id,
      message_kind: payload.kind,
      body,
    })

    await audit(conv.company_id, 'info', 'sent', `Enviada ${payload.kind} via WhatsApp`, { conversation_id: conv.id, kind: payload.kind, instance: instanceName, phone: conv.phone, body_preview: body.slice(0, 120) })
    await recordAttempt({ company_id: conv.company_id, conversation_id: conv.id, queue_id: queueIdForLog, kind: payload.kind, phase: 'sent', origin: originForLog, flags, http_status: resp.status, evolution_response: result, instance_name: instanceName, body_preview: body.slice(0, 200) })

    return new Response(JSON.stringify({ success: true, attempt_recorded: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('attendance-auto-reply error', e?.message)
    await audit(companyForLog, 'error', 'error', e?.message || 'Erro desconhecido', { conversation_id: conversationId, kind: kindForLog })
    await recordAttempt({ company_id: companyForLog, conversation_id: conversationId, queue_id: queueIdForLog, kind: kindForLog || 'unknown', phase: 'failed', origin: originForLog, error_message: e?.message || 'Erro desconhecido' })
    return new Response(JSON.stringify({ error: e?.message || 'Erro' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
