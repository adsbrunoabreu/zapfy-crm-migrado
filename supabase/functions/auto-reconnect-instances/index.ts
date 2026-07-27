// Auto-reconexão de instâncias Evolution com backoff exponencial.
// Roda via cron a cada 1 minuto. Para cada instância marcada como down,
// se passou o tempo do próximo backoff, dispara /instance/connect/{name}.
// Backoff: 1m, 2m, 5m, 10m, 30m, 1h, 2h, 4h. Limite padrão: 8 tentativas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
}

const normalizeUrl = (raw: string) => raw.trim().replace(/\/+$/, '')

// Backoff em minutos (cumulativo, não a cada tentativa)
const BACKOFF_MINUTES = [1, 2, 5, 10, 30, 60, 120, 240]

interface ReconnectConfig {
  enabled: boolean
  max_attempts: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const EVO_URL = normalizeUrl(Deno.env.get('EVOLUTION_MASTER_URL') || '')
  const EVO_KEY = Deno.env.get('EVOLUTION_MASTER_API_KEY') || ''

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // ── Auth: x-internal-key (cron) OU master JWT ──
  const internalKey = req.headers.get('x-internal-key') || ''
  const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
  const isInternal = internalKey && (internalKey === CRON_SECRET || internalKey === SERVICE_KEY)
  if (!isInternal) {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { data: isMaster } = await admin.rpc('is_master', { _user_id: user.id })
    if (!isMaster) return json({ error: 'Forbidden' }, 403)
  }

  const startedAt = Date.now()
  try {
    const { data: cfgRow } = await admin
      .from('system_integrations')
      .select('value')
      .eq('key', 'instance_auto_reconnect')
      .maybeSingle()

    const cfg: ReconnectConfig = {
      enabled: false,
      max_attempts: BACKOFF_MINUTES.length,
      ...(cfgRow?.value as any || {}),
    }

    await admin.from('system_logs').insert({
      source: 'auto_reconnect',
      level: 'info',
      event: 'auto_reconnect.tick',
      message: cfg.enabled ? 'Reconexão executada' : 'Auto-reconexão desabilitada',
      metadata: { enabled: cfg.enabled, max_attempts: cfg.max_attempts },
    })

    if (!cfg.enabled) return json({ success: true, skipped: 'disabled' })
    if (!EVO_URL || !EVO_KEY) return json({ success: false, error: 'Evolution Master não configurada' }, 500)

    const now = new Date()

    // Candidatos: down há algum tempo, não desistidos, prontos para próxima tentativa
    const { data: candidates } = await admin
      .from('instance_health')
      .select('*')
      .not('down_since', 'is', null)
      .eq('reconnect_given_up', false)

    let attempted = 0
    let succeeded = 0
    let givenUp = 0
    let waiting = 0

    for (const h of candidates || []) {
      const nextAt = h.next_reconnect_at ? new Date(h.next_reconnect_at) : now
      if (nextAt > now) { waiting++; continue }

      const attempts = (h.reconnect_attempts || 0) + 1
      const maxAttempts = Math.min(cfg.max_attempts, BACKOFF_MINUTES.length)

      attempted++

      // Dispara connect na Evolution
      let ok = false
      let errorMsg: string | null = null
      try {
        const resp = await fetch(`${EVO_URL}/instance/connect/${encodeURIComponent(h.instance_name)}`, {
          method: 'GET',
          headers: { apikey: EVO_KEY },
        })
        const txt = await resp.text()
        if (resp.ok) {
          ok = true
        } else {
          errorMsg = `HTTP ${resp.status}: ${txt.slice(0, 200)}`
        }
      } catch (e: any) {
        errorMsg = e?.message || 'fetch failed'
      }

      if (ok) succeeded++

      // Decide próximo agendamento
      const exhausted = attempts >= maxAttempts
      if (exhausted && !ok) givenUp++

      const nextIdx = Math.min(attempts, BACKOFF_MINUTES.length - 1)
      const nextDelayMs = BACKOFF_MINUTES[nextIdx] * 60_000

      await admin.from('instance_health').update({
        reconnect_attempts: attempts,
        last_reconnect_at: now.toISOString(),
        last_reconnect_error: errorMsg,
        next_reconnect_at: exhausted ? null : new Date(now.getTime() + nextDelayMs).toISOString(),
        reconnect_given_up: exhausted && !ok,
      }).eq('instance_name', h.instance_name)

      await admin.from('instance_events').insert({
        instance_name: h.instance_name,
        scope: h.scope,
        company_id: h.company_id,
        event_type: ok ? 'reconnect_attempted' : 'reconnect_failed',
        previous_state: h.last_state,
        new_state: ok ? 'connecting' : h.last_state,
        metadata: {
          attempt: attempts,
          max_attempts: maxAttempts,
          error: errorMsg,
          given_up: exhausted && !ok,
          next_in_minutes: exhausted ? null : BACKOFF_MINUTES[nextIdx],
        },
      })

      console.log(`[auto-reconnect] ${h.instance_name} attempt ${attempts}/${maxAttempts} ${ok ? 'OK' : 'FAIL'} ${errorMsg || ''}`)
    }

    const duration_ms = Date.now() - startedAt
    await admin.from('system_logs').insert({
      source: 'auto_reconnect',
      level: 'info',
      event: 'auto_reconnect.run',
      message: `Reconexão executada: ${attempted} tentativas, ${succeeded} sucesso, ${givenUp} desistidas`,
      metadata: {
        ok: true,
        duration_ms,
        candidates: candidates?.length || 0,
        attempted,
        succeeded,
        given_up: givenUp,
        waiting,
        processed: attempted,
      },
    })
    return json({
      success: true,
      candidates: candidates?.length || 0,
      attempted,
      succeeded,
      given_up: givenUp,
      waiting,
      duration_ms,
    })
  } catch (e: any) {
    console.error('[auto-reconnect] error', e?.message)
    const duration_ms = Date.now() - startedAt
    await admin.from('system_logs').insert({
      source: 'auto_reconnect',
      level: 'error',
      event: 'auto_reconnect.run',
      message: `Erro na reconexão: ${e?.message || 'desconhecido'}`,
      metadata: { ok: false, duration_ms, error: String(e?.message || e) },
    })
    return json({ success: false, error: e?.message }, 500)
  }
})

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
