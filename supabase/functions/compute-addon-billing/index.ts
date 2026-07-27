// Calcula consumo de add-ons (Agente IA) por empresa e atualiza
// o valor da subscription recorrente no Asaas para a próxima cobrança.
//
// Modos de chamada:
//  - mode=hourly  → cron horário, processa só empresas cuja hora local
//                   bate com companies.billing_run_hour e que ainda não
//                   rodaram hoje (por timezone da empresa).
//  - mode=manual ou body.company_id → roda imediatamente para a empresa.
//
// Auth: x-internal-key === SUPABASE_SERVICE_ROLE_KEY OU body.mode='hourly'
//       (cron usa apikey anon; validamos pelo modo).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

  let body: any = {}
  try { body = await req.json() } catch { /* sem body */ }
  const mode: string = body?.mode || 'manual'
  const explicitCompanyId: string | undefined = body?.company_id

  // Cron usa mode=hourly com apikey anon — sem service key.
  // Demais modos exigem service key.
  if (mode !== 'hourly') {
    const internalKey = req.headers.get('x-internal-key') || ''
    if (internalKey !== SERVICE_KEY) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const updated: any[] = []
  const errors: any[] = []

  try {
    // Asaas config
    const { data: cfg } = await admin.from('system_integrations')
      .select('value').eq('key', 'asaas').maybeSingle()
    const env = ((cfg?.value as any)?.environment === 'live' ? 'live' : 'sandbox') as 'live' | 'sandbox'
    const ASAAS_KEY = (cfg?.value as any)?.[env === 'live' ? 'live_api_key' : 'sandbox_api_key']
    const ASAAS_BASE = env === 'live'
      ? 'https://api.asaas.com/v3'
      : 'https://sandbox.asaas.com/api/v3'

    // Resolver empresas alvo conforme modo
    let targetCompanyIds: string[] = []

    if (explicitCompanyId) {
      targetCompanyIds = [explicitCompanyId]
    } else if (mode === 'hourly') {
      const { data: due, error: dueErr } = await admin.rpc('get_companies_due_for_billing')
      if (dueErr) throw dueErr
      targetCompanyIds = (due || []).map((r: any) => r.company_id)
    } else {
      // manual sem company_id → todas com add-on ativo
      const { data: all } = await admin.from('company_addons')
        .select('company_id').eq('is_active', true).eq('addon_slug', 'ai_agent')
      targetCompanyIds = (all || []).map((r: any) => r.company_id)
    }

    if (targetCompanyIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, mode, updated: [], errors: [], note: 'nenhuma empresa elegível' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Carrega add-ons ativos das empresas alvo
    const { data: addons } = await admin.from('company_addons')
      .select('company_id, monthly_price, included_messages, overage_price_per_message')
      .eq('is_active', true)
      .eq('addon_slug', 'ai_agent')
      .in('company_id', targetCompanyIds)

    const addonByCompany = new Map<string, any>()
    for (const a of addons || []) addonByCompany.set(a.company_id, a)

    for (const cid of targetCompanyIds) {
      try {
        const addon = addonByCompany.get(cid)
        const periodStart = new Date()
        periodStart.setDate(1); periodStart.setHours(0, 0, 0, 0)

        let addonTotal = 0
        let overage = 0
        let messagesConsumed = 0
        if (addon) {
          const { data: usage } = await admin.rpc('get_ai_addon_usage', {
            _company_id: cid,
            _period_start: periodStart.toISOString(),
            _period_end: new Date().toISOString(),
          })
          const u = usage as any
          overage = Number(u?.overage_messages || 0)
          messagesConsumed = Number(u?.messages_consumed || 0)
          const overageCost = Number(u?.overage_cost_brl || 0)
          addonTotal = Number(addon.monthly_price) + overageCost
        }

        const { data: sub } = await admin.from('subscriptions')
          .select('id, asaas_subscription_id, monthly_price, plan_id, billing_cycle, plan_name')
          .eq('company_id', cid)
          .order('created_at', { ascending: false }).limit(1).maybeSingle()

        if (!sub?.asaas_subscription_id || !ASAAS_KEY) {
          await admin.from('companies').update({ last_billing_sync_at: new Date().toISOString() })
            .eq('id', cid)
          updated.push({ company_id: cid, skipped: 'no_asaas_sub_or_key', addon_total: addonTotal })
          continue
        }

        const baseValue = sub.billing_cycle === 'yearly'
          ? Number(sub.monthly_price) * 12
          : Number(sub.monthly_price)
        const newValue = Number((baseValue + addonTotal).toFixed(2))

        const description = addon
          ? `${sub.plan_name} + Agente IA (${messagesConsumed} msgs${overage > 0 ? `, ${overage} excedentes` : ''})`
          : `${sub.plan_name}`

        const r = await fetch(`${ASAAS_BASE}/subscriptions/${sub.asaas_subscription_id}`, {
          method: 'PUT',
          headers: {
            access_token: ASAAS_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ value: newValue, description }),
        })

        if (!r.ok) {
          const t = await r.text()
          errors.push({ company_id: cid, status: r.status, body: t.slice(0, 200) })
          continue
        }

        await admin.from('companies').update({ last_billing_sync_at: new Date().toISOString() })
          .eq('id', cid)

        updated.push({
          company_id: cid,
          base_value: baseValue,
          addon_total: addonTotal,
          new_subscription_value: newValue,
          messages_consumed: messagesConsumed,
          overage_messages: overage,
          addon_active: !!addon,
        })
      } catch (e: any) {
        errors.push({ company_id: cid, error: e?.message })
      }
    }

    return new Response(JSON.stringify({ ok: true, mode, updated, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'erro' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
