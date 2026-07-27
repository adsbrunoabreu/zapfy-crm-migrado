// Modo "replay": simula (dry_run) ou executa o fluxo de uma automação
// Retorna a árvore de decisões antes de qualquer envio.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Kind = 'off_hours' | 'welcome' | 'wait_time'

interface Body {
  conversation_id: string
  kind: Kind
  dry_run?: boolean
}

type Step = { step: string; ok: boolean; detail?: string; meta?: Record<string, unknown> }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: isMaster } = await admin.rpc('is_master', { _user_id: user.id })
  const { data: profile } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle()
  const { data: isCompanyAdmin } = await admin.rpc('has_role', { _user_id: user.id, _role: 'admin' })

  const isAdmin = isMaster || isCompanyAdmin
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: Body
  try { body = await req.json() } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  if (!body?.conversation_id || !body?.kind) {
    return new Response(JSON.stringify({ error: 'conversation_id e kind são obrigatórios' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const dryRun = body.dry_run !== false // default true
  const steps: Step[] = []

  // 1. Conversa
  const { data: conv } = await admin
    .from('conversations')
    .select('id, company_id, phone, instance_name, contact_name, lead_id')
    .eq('id', body.conversation_id)
    .maybeSingle()
  if (!conv) {
    steps.push({ step: 'conversation', ok: false, detail: 'Conversa não encontrada' })
    return new Response(JSON.stringify({ would_send: false, steps }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  steps.push({
    step: 'conversation',
    ok: true,
    detail: `Conversa ${conv.contact_name || conv.phone}`,
    meta: { phone: conv.phone, instance: conv.instance_name },
  })

  // Tenant guard
  if (!isMaster && conv.company_id !== profile?.company_id) {
    return new Response(JSON.stringify({ error: 'forbidden_tenant' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2. Plano ativo
  const { data: companyActive } = await admin.rpc('is_company_active', { _company_id: conv.company_id })
  steps.push({ step: 'company_active', ok: !!companyActive, detail: companyActive ? 'Plano ativo' : 'Plano suspenso/cancelado — bloqueia envio' })

  // 3. Settings + flags
  const { data: settings } = await admin
    .from('attendance_settings')
    .select('general, business_hours, holidays')
    .eq('company_id', conv.company_id)
    .maybeSingle()

  const bh = (settings?.business_hours as any) || {}
  const gen = (settings?.general as any) || {}
  const off_enabled = Boolean(bh?.off_hours_enabled)
  const welcome_enabled = Boolean(gen?.welcome_message && String(gen.welcome_message).trim().length > 0)
  const wait_enabled = Boolean(gen?.show_wait_time)

  const featureEnabled =
    body.kind === 'off_hours' ? off_enabled :
    body.kind === 'welcome' ? welcome_enabled :
    body.kind === 'wait_time' ? wait_enabled : true
  steps.push({
    step: 'feature_enabled',
    ok: featureEnabled,
    detail: featureEnabled ? `${body.kind} está ativo` : `${body.kind} está DESATIVADO nas configurações`,
    meta: { off_hours_enabled: off_enabled, welcome_enabled, wait_time_enabled: wait_enabled },
  })

  // 4. Off-hours (se kind off_hours, valida horário)
  if (body.kind === 'off_hours') {
    const { data: isOff } = await admin.rpc('is_off_business_hours_at', {
      _business_hours: bh,
      _holidays: settings?.holidays || [],
      _at: new Date().toISOString(),
    } as any)
    steps.push({
      step: 'off_business_hours',
      ok: !!isOff,
      detail: isOff ? 'No momento estamos FORA do horário (regra atende)' : 'No momento estamos DENTRO do horário — não deveria enviar off_hours',
    })
  }

  // 5. Anti-duplicação 6h
  const cutoff = new Date(Date.now() - 6 * 3600 * 1000).toISOString()
  const { data: recent } = await admin
    .from('attendance_auto_messages')
    .select('id, sent_at')
    .eq('conversation_id', conv.id)
    .eq('message_kind', body.kind)
    .gte('sent_at', cutoff)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  steps.push({
    step: 'recent_duplicate',
    ok: !recent,
    detail: recent ? `Já enviado às ${recent.sent_at} — bloquearia` : 'Nenhum envio recente para este tipo (6h)',
  })

  // 6. Body resolvido
  let resolvedBody = ''
  if (body.kind === 'off_hours') resolvedBody = bh?.off_hours_message || ''
  else if (body.kind === 'welcome') resolvedBody = gen?.welcome_message || ''
  else if (body.kind === 'wait_time') resolvedBody = 'Você está na fila. Tempo estimado de espera: 5 minutos.'
  steps.push({
    step: 'message_body',
    ok: !!resolvedBody.trim(),
    detail: resolvedBody.trim() ? `${resolvedBody.length} chars` : 'Body vazio — bloquearia',
    meta: { preview: resolvedBody.slice(0, 200) },
  })

  // 7. Instância WhatsApp
  let instanceName: string | null = conv.instance_name
  if (!instanceName) {
    const { data: inst } = await admin
      .from('whatsapp_instances')
      .select('instance_name')
      .eq('company_id', conv.company_id)
      .eq('status', 'connected')
      .limit(1)
      .maybeSingle()
    instanceName = inst?.instance_name || null
  }
  steps.push({
    step: 'whatsapp_instance',
    ok: !!instanceName,
    detail: instanceName ? `Usaria: ${instanceName}` : 'Nenhuma instância WhatsApp disponível',
  })

  const wouldSend = steps.every((s) => s.ok)

  // Se for execute e tudo passar → chama attendance-auto-reply
  let executed = false
  let executionResult: unknown = null
  if (!dryRun && wouldSend) {
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/attendance-auto-reply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-key': SERVICE_KEY,
      },
      body: JSON.stringify({
        conversation_id: conv.id,
        kind: body.kind,
        origin: 'manual_replay_ui',
      }),
    })
    executionResult = await resp.json().catch(() => ({}))
    executed = resp.ok

    await admin.from('system_logs').insert({
      company_id: conv.company_id,
      source: 'attendance_auto',
      level: 'info',
      event: 'manual_replay',
      message: `Replay manual de ${body.kind}`,
      metadata: {
        conversation_id: conv.id,
        kind: body.kind,
        executed_by: user.id,
        steps,
        result: executionResult,
        origin: 'edge_function:replay-attendance-auto',
      },
    })
  }

  return new Response(JSON.stringify({
    dry_run: dryRun,
    would_send: wouldSend,
    executed,
    execution_result: executionResult,
    steps,
    flags: { off_hours_enabled: off_enabled, welcome_enabled, wait_time_enabled: wait_enabled },
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
