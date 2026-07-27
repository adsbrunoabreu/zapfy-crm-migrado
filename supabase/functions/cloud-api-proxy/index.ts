/**
 * cloud-api-proxy
 * ---------------
 * Proxy server-side para a WhatsApp Cloud API (Meta Graph API).
 *
 * A Graph API NÃO expõe CORS, então o navegador é bloqueado ao chamar
 * `graph.facebook.com` diretamente. Este edge function recebe a chamada
 * autenticada do front-end (JWT do usuário), valida que o token de acesso
 * pertence a uma instância da empresa do usuário e repassa a requisição.
 *
 * Body esperado:
 *   {
 *     path: string;          // ex.: "/{phoneNumberId}/messages"
 *     method: 'GET'|'POST'|'DELETE'|'PUT';
 *     body?: unknown;
 *     instanceId?: string;   // (preferencial) — busca accessToken no banco
 *     accessToken?: string;  // (fallback) — quando instanceId não enviado
 *   }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const GRAPH_BASE = 'https://graph.facebook.com/v18.0'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const auth = req.headers.get('Authorization') ?? ''
    if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'unauthorized' }, 401)

    const adminClient = createClient(url, service)

    // Resolve company_id do usuário
    const { data: profile } = await adminClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile?.company_id) return json({ error: 'no_company' }, 403)

    const payload = await req.json().catch(() => ({})) as {
      path?: string
      method?: string
      body?: unknown
      instanceId?: string
      accessToken?: string
    }

    const path = String(payload.path ?? '')
    const method = String(payload.method ?? 'POST').toUpperCase()
    if (!path.startsWith('/')) return json({ error: 'invalid_path' }, 400)
    if (!['GET', 'POST', 'DELETE', 'PUT'].includes(method)) {
      return json({ error: 'invalid_method' }, 400)
    }

    // Resolve accessToken: preferencialmente via instanceId (server-side),
    // fallback ao token vindo do client (já em memória do provider).
    let accessToken: string | null = null
    if (payload.instanceId) {
      const { data: inst } = await adminClient
        .from('whatsapp_instances')
        .select('company_id, provider, config')
        .eq('id', payload.instanceId)
        .maybeSingle()
      if (!inst || inst.company_id !== profile.company_id) {
        return json({ error: 'instance_forbidden' }, 403)
      }
      if (inst.provider !== 'cloud_api') {
        return json({ error: 'instance_not_cloud_api' }, 400)
      }
      const cfg = (inst.config ?? {}) as Record<string, unknown>
      accessToken = (cfg.accessToken as string) ?? null
    }
    if (!accessToken && payload.accessToken) {
      accessToken = String(payload.accessToken)
    }
    if (!accessToken) return json({ error: 'missing_access_token' }, 400)

    const upstream = await fetch(`${GRAPH_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: method === 'GET' ? undefined : JSON.stringify(payload.body ?? {}),
    })

    const text = await upstream.text()
    let parsed: unknown = null
    try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }

    return new Response(
      JSON.stringify({ status: upstream.status, ok: upstream.ok, data: parsed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('[cloud-api-proxy] error:', (e as Error)?.message)
    return json({ error: (e as Error)?.message ?? 'internal_error' }, 500)
  }
})
