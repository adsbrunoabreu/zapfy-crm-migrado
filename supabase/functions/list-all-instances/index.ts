// Lista todas as instâncias da Evolution Master com estado atual + dados de saúde.
// Apenas Masters.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const normalizeUrl = (raw: string) => raw.trim().replace(/\/+$/, '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const EVO_URL = normalizeUrl(Deno.env.get('EVOLUTION_MASTER_URL') || '')
  const EVO_KEY = Deno.env.get('EVOLUTION_MASTER_API_KEY') || ''

  try {
    // Autenticação + verifica master
    const authHeader = req.headers.get('Authorization') || ''
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) {
      return json({ error: 'Unauthorized' }, 401)
    }
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: isMaster } = await admin.rpc('is_master', { _user_id: userData.user.id })
    if (!isMaster) return json({ error: 'Forbidden' }, 403)

    if (!EVO_URL || !EVO_KEY) {
      return json({ error: 'Evolution Master não configurada' }, 500)
    }

    // 1) Snapshot Evolution
    const evoResp = await fetch(`${EVO_URL}/instance/fetchInstances`, {
      headers: { apikey: EVO_KEY },
    })
    if (!evoResp.ok) {
      return json({ error: `Evolution HTTP ${evoResp.status}` }, 500)
    }
    const evoList: any[] = await evoResp.json()

    // 2) Mapeia company_id e instância interna
    const { data: dbInstances } = await admin
      .from('whatsapp_instances')
      .select('instance_name, company_id, display_name')
    const dbMap = new Map<string, { company_id: string; display_name: string }>()
    for (const i of dbInstances || []) {
      if (i.instance_name) dbMap.set(i.instance_name, { company_id: i.company_id, display_name: i.display_name })
    }

    const { data: internalCfg } = await admin
      .from('system_integrations').select('value').eq('key', 'evolution_internal').maybeSingle()
    const internalName = (internalCfg?.value as any)?.instance_name || null

    // 3) Companies
    const companyIds = Array.from(new Set(Array.from(dbMap.values()).map(v => v.company_id)))
    const companyNameMap = new Map<string, string>()
    if (companyIds.length > 0) {
      const { data: comps } = await admin.from('companies').select('id, name').in('id', companyIds)
      for (const c of comps || []) companyNameMap.set(c.id, c.name)
    }

    // 4) Instance health
    const { data: health } = await admin.from('instance_health').select('*')
    const healthMap = new Map<string, any>()
    for (const h of health || []) healthMap.set(h.instance_name, h)

    const instances = evoList.map((i: any) => {
      const name = i?.name || i?.instance?.instanceName || i?.instanceName || ''
      const state = i?.connectionStatus || i?.instance?.state || i?.state || 'unknown'
      const isInternal = name === internalName
      const dbInfo = dbMap.get(name)
      const company_id = isInternal ? null : (dbInfo?.company_id || null)
      const h = healthMap.get(name)
      return {
        instance_name: name,
        display_name: dbInfo?.display_name || name,
        state,
        scope: isInternal ? 'system' : (company_id ? 'company' : 'orphan'),
        company_id,
        company_name: isInternal
          ? 'Sistema (interna)'
          : (company_id ? (companyNameMap.get(company_id) || '—') : 'Sem vínculo'),
        phone: i?.ownerJid || i?.number || null,
        profile_name: i?.profileName || null,
        down_since: h?.down_since || null,
        last_seen_at: h?.last_seen_at || null,
        reconnect_attempts: h?.reconnect_attempts || 0,
        next_reconnect_at: h?.next_reconnect_at || null,
        last_reconnect_error: h?.last_reconnect_error || null,
        reconnect_given_up: h?.reconnect_given_up || false,
      }
    }).filter((s) => s.instance_name)

    return json({ instances })
  } catch (e: any) {
    return json({ error: e?.message }, 500)
  }
})

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
