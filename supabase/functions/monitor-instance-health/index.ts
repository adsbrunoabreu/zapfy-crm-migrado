// Monitor de saúde das instâncias Evolution.
// Roda via cron a cada 1 minuto. Detecta instâncias offline há > threshold
// e dispara alertas por e-mail (uma vez na queda, uma vez na recuperação).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
}

const normalizeUrl = (raw: string) => raw.trim().replace(/\/+$/, '')
const isConnected = (s: string) => s === 'open' || s === 'connected'

interface AlertConfig {
  enabled: boolean
  threshold_minutes: number
  extra_emails: string[]
}

interface InstanceSnapshot {
  name: string
  state: string
  scope: 'system' | 'company'
  company_id: string | null
  company_name: string | null
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
    // 1) Carrega config
    const { data: cfgRow } = await admin
      .from('system_integrations')
      .select('value')
      .eq('key', 'instance_alerts')
      .maybeSingle()

    const cfg: AlertConfig = {
      enabled: false,
      threshold_minutes: 15,
      extra_emails: [],
      ...(cfgRow?.value as any || {}),
    }

    // Heartbeat: registra que o monitor rodou
    await admin.from('system_logs').insert({
      source: 'monitor_instances',
      level: 'info',
      event: 'monitor_instances.tick',
      message: cfg.enabled ? 'Verificação executada' : 'Monitor desabilitado',
      metadata: { enabled: cfg.enabled, threshold_minutes: cfg.threshold_minutes },
    })

    if (!cfg.enabled) {
      return json({ success: true, skipped: 'alerts_disabled' })
    }

    if (!EVO_URL || !EVO_KEY) {
      return json({ success: false, error: 'Evolution Master não configurada' }, 500)
    }

    // 2) Snapshot da Evolution Master
    const evoResp = await fetch(`${EVO_URL}/instance/fetchInstances`, {
      headers: { apikey: EVO_KEY },
    })
    if (!evoResp.ok) {
      return json({ success: false, error: `Evolution HTTP ${evoResp.status}` }, 500)
    }
    const evoList: any[] = await evoResp.json()

    // 3) Mapa company_id por instance_name (via tabela whatsapp_instances)
    const { data: dbInstances } = await admin
      .from('whatsapp_instances')
      .select('instance_name, company_id')
    const companyByName = new Map<string, string>()
    for (const i of dbInstances || []) {
      if (i.instance_name && i.company_id) companyByName.set(i.instance_name, i.company_id)
    }

    // 4) Identifica a interna do sistema
    const { data: internalCfg } = await admin
      .from('system_integrations').select('value').eq('key', 'evolution_internal').maybeSingle()
    const internalName = (internalCfg?.value as any)?.instance_name || null

    // 5) Resolve company_name em batch
    const companyIds = Array.from(new Set(Array.from(companyByName.values())))
    const companyNameMap = new Map<string, string>()
    if (companyIds.length > 0) {
      const { data: comps } = await admin.from('companies').select('id, name').in('id', companyIds)
      for (const c of comps || []) companyNameMap.set(c.id, c.name)
    }

    const snapshots: InstanceSnapshot[] = evoList.map((i: any) => {
      const name = i?.name || i?.instance?.instanceName || i?.instanceName || ''
      const state = i?.connectionStatus || i?.instance?.state || i?.state || 'unknown'
      const isInternal = name === internalName
      const company_id = isInternal ? null : (companyByName.get(name) || null)
      return {
        name,
        state,
        scope: isInternal ? 'system' : 'company',
        company_id,
        company_name: isInternal
          ? 'Sistema (interna)'
          : (company_id ? (companyNameMap.get(company_id) || 'Empresa') : 'Sem vínculo'),
      }
    }).filter((s) => s.name)

    const now = new Date()
    const thresholdMs = cfg.threshold_minutes * 60_000
    let alertsSent = 0
    let recoveriesSent = 0

    for (const snap of snapshots) {
      // Lê estado anterior
      const { data: prev } = await admin
        .from('instance_health')
        .select('*')
        .eq('instance_name', snap.name)
        .maybeSingle()

      const connected = isConnected(snap.state)
      const wasConnected = prev ? isConnected(prev.last_state) : true
      const isFirstSeen = !prev

      if (!connected) {
        // Marca down_since se não estava registrado
        const downSince = prev?.down_since ? new Date(prev.down_since) : now
        const offlineMs = now.getTime() - downSince.getTime()
        const shouldAlert = offlineMs >= thresholdMs && !prev?.down_alerted_at

        // Registra evento de DESCONEXÃO na primeira detecção da queda
        if ((wasConnected && !isFirstSeen) || (isFirstSeen && !connected)) {
          await admin.from('instance_events').insert({
            instance_name: snap.name,
            scope: snap.scope,
            company_id: snap.company_id,
            event_type: 'disconnected',
            previous_state: prev?.last_state || null,
            new_state: snap.state,
            down_since: downSince.toISOString(),
            metadata: { company_name: snap.company_name },
          })
        }

        // Agenda primeira tentativa de reconexão se ainda não há
        const firstAttemptAt = prev?.next_reconnect_at
          ? prev.next_reconnect_at
          : new Date(downSince.getTime() + 60_000).toISOString() // 1 min após queda

        await admin.from('instance_health').upsert({
          instance_name: snap.name,
          scope: snap.scope,
          company_id: snap.company_id,
          last_state: snap.state,
          last_seen_at: now.toISOString(),
          down_since: downSince.toISOString(),
          down_alerted_at: shouldAlert ? now.toISOString() : prev?.down_alerted_at || null,
          recovered_alerted_at: null,
          next_reconnect_at: prev?.reconnect_given_up ? null : firstAttemptAt,
        }, { onConflict: 'instance_name' })

        if (shouldAlert) {
          const recipients = await resolveRecipients(admin, snap.company_id, cfg.extra_emails)
          if (recipients.length > 0) {
            await sendTemplateEmail(admin, SUPABASE_URL, SERVICE_KEY, 'instance_disconnected', recipients, {
              instance_name: snap.name,
              minutes: String(Math.round(offlineMs / 60_000)),
              company_name: snap.company_name || '—',
              detected_at: now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            }, snap.company_id)
            alertsSent++
            console.log(`[monitor] DOWN alert sent for ${snap.name} (${recipients.length} recipients)`)
          }
        }
      } else {
        // Conectado: se havia alerta de down sem recovery, dispara recovery
        const wasDown = prev?.down_alerted_at && !prev?.recovered_alerted_at
        const downtime = prev?.down_since
          ? Math.round((now.getTime() - new Date(prev.down_since).getTime()) / 60_000)
          : 0
        const downtimeSeconds = prev?.down_since
          ? Math.round((now.getTime() - new Date(prev.down_since).getTime()) / 1000)
          : 0

        // Registra evento de RECONEXÃO em qualquer transição offline→online
        if (prev && !wasConnected) {
          await admin.from('instance_events').insert({
            instance_name: snap.name,
            scope: snap.scope,
            company_id: snap.company_id,
            event_type: 'reconnected',
            previous_state: prev.last_state,
            new_state: snap.state,
            down_since: prev.down_since,
            duration_seconds: downtimeSeconds || null,
            metadata: { company_name: snap.company_name, downtime_minutes: downtime },
          })
        }

        await admin.from('instance_health').upsert({
          instance_name: snap.name,
          scope: snap.scope,
          company_id: snap.company_id,
          last_state: snap.state,
          last_seen_at: now.toISOString(),
          down_since: null,
          down_alerted_at: wasDown ? prev?.down_alerted_at : null,
          recovered_alerted_at: wasDown ? now.toISOString() : null,
          // Reset do auto-reconnect ao reconectar
          reconnect_attempts: 0,
          next_reconnect_at: null,
          last_reconnect_error: null,
          reconnect_given_up: false,
        }, { onConflict: 'instance_name' })

        if (wasDown) {
          const recipients = await resolveRecipients(admin, snap.company_id, cfg.extra_emails)
          if (recipients.length > 0) {
            await sendTemplateEmail(admin, SUPABASE_URL, SERVICE_KEY, 'instance_reconnected', recipients, {
              instance_name: snap.name,
              downtime_minutes: String(downtime),
              company_name: snap.company_name || '—',
              reconnected_at: now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
            }, snap.company_id)
            recoveriesSent++
            console.log(`[monitor] RECOVERY alert sent for ${snap.name}`)
          }
        }
      }
    }

    const duration_ms = Date.now() - startedAt
    await admin.from('system_logs').insert({
      source: 'monitor_instances',
      level: 'info',
      event: 'monitor_instances.run',
      message: `Monitor executado: ${snapshots.length} verificadas, ${alertsSent} alertas, ${recoveriesSent} recuperações`,
      metadata: {
        ok: true,
        duration_ms,
        checked: snapshots.length,
        alerts_sent: alertsSent,
        recoveries_sent: recoveriesSent,
        processed: snapshots.length,
      },
    })
    return json({
      success: true,
      checked: snapshots.length,
      alerts_sent: alertsSent,
      recoveries_sent: recoveriesSent,
      duration_ms,
    })
  } catch (e: any) {
    console.error('[monitor] error', e?.message)
    const duration_ms = Date.now() - startedAt
    await admin.from('system_logs').insert({
      source: 'monitor_instances',
      level: 'error',
      event: 'monitor_instances.run',
      message: `Erro no monitor: ${e?.message || 'desconhecido'}`,
      metadata: { ok: false, duration_ms, error: String(e?.message || e) },
    })
    return json({ success: false, error: e?.message }, 500)
  }
})

async function resolveRecipients(admin: any, companyId: string | null, extra: string[]): Promise<string[]> {
  const set = new Set<string>()

  // Master users
  const { data: masters } = await admin
    .from('user_roles')
    .select('user_id, profiles!inner(email)')
    .eq('role', 'master')
  for (const m of masters || []) {
    const email = (m as any).profiles?.email
    if (email) set.add(email.toLowerCase())
  }

  // Admin da empresa afetada
  if (companyId) {
    const { data: admins } = await admin
      .from('profiles')
      .select('email')
      .eq('company_id', companyId)
      .eq('role', 'admin')
    for (const a of admins || []) {
      if (a.email) set.add(a.email.toLowerCase())
    }
  }

  // Extras configurados
  for (const e of extra || []) {
    if (e && e.includes('@')) set.add(e.toLowerCase())
  }

  return Array.from(set)
}

async function sendTemplateEmail(
  admin: any,
  supabaseUrl: string,
  serviceKey: string,
  slug: string,
  to: string[],
  variables: Record<string, string>,
  companyId: string | null,
) {
  // Chama send-email via fetch usando service role (bypass auth check com header especial)
  // Como send-email exige Authorization header com user, fazemos render aqui e mandamos direto via Resend
  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) {
    console.warn('[monitor] RESEND_API_KEY não configurado, pulando envio')
    return
  }

  const { data: tpl } = await admin
    .from('email_templates')
    .select('subject, html_body, text_body')
    .eq('slug', slug)
    .eq('is_active', true)
    .is('company_id', null)
    .maybeSingle()
  if (!tpl) {
    console.warn(`[monitor] template ${slug} não encontrado`)
    return
  }

  const render = (s: string) => s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => variables[k] ?? '')
  const subject = render(tpl.subject)
  const html = render(tpl.html_body)
  const text = tpl.text_body ? render(tpl.text_body) : undefined

  const { data: cfg } = await admin
    .from('system_integrations').select('value').eq('key', 'resend').maybeSingle()
  const fromEmail = (cfg?.value as any)?.from_email || 'onboarding@resend.dev'
  const fromName = (cfg?.value as any)?.from_name || 'CRM'

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${fromName} <${fromEmail}>`, to, subject, html, text }),
  })
  const result = await resp.json()

  await admin.from('notification_log').insert({
    channel: 'email',
    template_slug: slug,
    recipient: to.join(','),
    subject,
    status: resp.ok ? 'sent' : 'failed',
    error: resp.ok ? null : JSON.stringify(result),
    payload: { variables, source: 'monitor-instance-health' },
    company_id: companyId,
    sent_by: null,
  })
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
