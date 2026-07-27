import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const normalizeUrl = (raw: string) => raw.trim().replace(/\/+$/, '')

interface Payload {
  action: 'create' | 'connect' | 'status' | 'delete' | 'list' | 'test' | 'send_test'
  instance_name?: string
  phone?: string
  message?: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ success: false, error: 'Não autenticado' }, 401)

    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: { user }, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !user) {
      console.error('[master-evolution-instance] auth failed', userErr?.message)
      return json({ success: false, error: 'Não autenticado' }, 401)
    }
    const { data: isMaster } = await admin.rpc('is_master', { _user_id: user.id })
    if (!isMaster) return json({ success: false, error: 'Apenas Master pode usar essa função' }, 403)

    const EVO_URL = normalizeUrl(Deno.env.get('EVOLUTION_MASTER_URL') || '')
    const EVO_KEY = Deno.env.get('EVOLUTION_MASTER_API_KEY') || ''
    if (!EVO_URL || !EVO_KEY) {
      return json({ success: false, error: 'Evolution Master não configurada (URL/API Key)' })
    }

    const headers = { 'Content-Type': 'application/json', apikey: EVO_KEY }
    const { action, instance_name, phone, message }: Payload = await req.json()

    let url = ''
    let method: 'GET' | 'POST' | 'DELETE' = 'GET'
    let payload: any = undefined

    switch (action) {
      case 'test':
      case 'list':
        url = `${EVO_URL}/instance/fetchInstances`; method = 'GET'; break
      case 'create':
        if (!instance_name) return json({ success: false, error: 'instance_name requerido' }, 400)
        url = `${EVO_URL}/instance/create`; method = 'POST'
        payload = { instanceName: instance_name, qrcode: true, integration: 'WHATSAPP-BAILEYS' }
        break
      case 'connect':
        if (!instance_name) return json({ success: false, error: 'instance_name requerido' }, 400)
        url = `${EVO_URL}/instance/connect/${instance_name}`; method = 'GET'; break
      case 'status':
        if (!instance_name) return json({ success: false, error: 'instance_name requerido' }, 400)
        url = `${EVO_URL}/instance/connectionState/${instance_name}`; method = 'GET'; break
      case 'delete':
        if (!instance_name) return json({ success: false, error: 'instance_name requerido' }, 400)
        url = `${EVO_URL}/instance/delete/${instance_name}`; method = 'DELETE'; break
      case 'send_test':
        if (!instance_name) return json({ success: false, error: 'instance_name requerido' }, 400)
        if (!phone || !message) return json({ success: false, error: 'phone e message requeridos' }, 400)
        url = `${EVO_URL}/message/sendText/${instance_name}`; method = 'POST'
        payload = { number: phone.replace(/\D/g, ''), text: message }
        break
      default:
        return json({ success: false, error: `Ação inválida: ${action}` }, 400)
    }

    console.log(`[evo-master] ${action} -> ${method} ${url}`)

    let resp: Response
    try {
      resp = await fetch(url, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined,
        signal: AbortSignal.timeout(20000),
      })
    } catch (fetchErr: any) {
      console.error('[evo-master] fetch error:', fetchErr?.message)
      return json({ success: false, error: `Falha de rede: ${fetchErr?.message || 'desconhecido'}` })
    }

    const text = await resp.text()
    let data: any
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    console.log(`[evo-master] ${action} status=${resp.status} body=${JSON.stringify(data).slice(0, 500)}`)

    // Always return HTTP 200 so the client can read success/status fields uniformly.
    return json({ success: resp.ok, status: resp.status, data })
  } catch (e: any) {
    console.error('[evo-master] uncaught error:', e?.message)
    return json({ success: false, error: e?.message || 'Erro' })
  }
})
