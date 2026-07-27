import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const renderVars = (template: string, vars: Record<string, string> = {}) => {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => vars[k] ?? '')
}

const normalizeUrl = (raw: string) => raw.trim().replace(/\/+$/, '')

interface Payload {
  template_slug?: string
  body?: string
  phone: string
  variables?: Record<string, string>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autenticado')

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) throw new Error('Não autenticado')

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)

    const { data: isMaster } = await admin.rpc('is_master', { _user_id: user.id })
    if (!isMaster) throw new Error('Apenas Master')

    const payload: Payload = await req.json()

    let body = payload.body || ''
    let templateSlug = payload.template_slug || null

    if (templateSlug) {
      const { data: tpl, error } = await admin
        .from('whatsapp_templates')
        .select('body')
        .eq('slug', templateSlug)
        .eq('is_active', true)
        .maybeSingle()
      if (error || !tpl) throw new Error(`Template "${templateSlug}" não encontrado`)
      body = renderVars(tpl.body, payload.variables)
    }

    if (!body || !payload.phone) throw new Error('phone e body são obrigatórios')

    const { data: cfg } = await admin
      .from('system_integrations').select('value').eq('key', 'evolution_internal').maybeSingle()
    const v = (cfg?.value as any) || {}
    const instanceName = v.instance_name
    if (!instanceName) throw new Error('Instância interna não configurada')

    const EVO_URL = normalizeUrl(Deno.env.get('EVOLUTION_MASTER_URL') || '')
    const EVO_KEY = Deno.env.get('EVOLUTION_MASTER_API_KEY') || ''
    if (!EVO_URL || !EVO_KEY) throw new Error('Evolution Master não configurada')

    const resp = await fetch(`${EVO_URL}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVO_KEY },
      body: JSON.stringify({ number: payload.phone, text: body }),
    })

    const result = await resp.json().catch(() => ({}))
    const ok = resp.ok

    await admin.from('notification_log').insert({
      channel: 'whatsapp',
      template_slug: templateSlug,
      recipient: payload.phone,
      status: ok ? 'sent' : 'failed',
      error: ok ? null : JSON.stringify(result),
      payload: { body, variables: payload.variables },
      sent_by: user.id,
    })

    if (!ok) throw new Error(JSON.stringify(result))

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('send-system-whatsapp error:', e?.message)
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Erro' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
