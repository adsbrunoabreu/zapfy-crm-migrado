// Healthcheck do provider ativo (cron). Testa, atualiza estado e alerta após 2 falhas seguidas.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Provider = 'lovable' | 'anthropic' | 'openai' | 'google'

const ENV_KEY: Record<Provider, string> = {
  lovable: 'LOVABLE_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
}

const TIMEOUT_MS = 10_000

async function fetchWithTimeout(url: string, init: RequestInit) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try { return await fetch(url, { ...init, signal: ctrl.signal }) } finally { clearTimeout(t) }
}

function maskHttpError(status: number) {
  if (status === 401 || status === 403) return 'Chave inválida'
  if (status === 404) return 'Modelo inexistente'
  if (status === 429) return 'Rate limit'
  if (status >= 500) return 'Provedor indisponível'
  return `HTTP ${status}`
}

async function ping(provider: Provider, model: string): Promise<{ ok: boolean; error?: string }> {
  const key = Deno.env.get(ENV_KEY[provider])
  if (!key) return { ok: false, error: 'chave ausente' }
  try {
    let r: Response
    if (provider === 'anthropic') {
      r = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 4, messages: [{ role: 'user', content: 'ping' }] }),
      })
    } else if (provider === 'openai') {
      r = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_completion_tokens: 4, messages: [{ role: 'user', content: 'ping' }] }),
      })
    } else if (provider === 'google') {
      r = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }) },
      )
    } else {
      r = await fetchWithTimeout('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }] }),
      })
    }
    if (!r.ok) return { ok: false, error: maskHttpError(r.status) }
    return { ok: true }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return { ok: false, error: 'timeout' }
    return { ok: false, error: 'rede' }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // Auth guard: aceita x-internal-key (cron) OU JWT de Master
  const internalKey = req.headers.get('x-internal-key') ?? ''
  const isInternal = !!internalKey && (internalKey === CRON_SECRET || internalKey === SERVICE_KEY)

  if (!isInternal) {
    const authHeader = req.headers.get('Authorization') ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: isMaster } = await admin.rpc('is_master', { _user_id: userData.user.id })
    if (!isMaster) {
      return new Response(JSON.stringify({ error: 'Forbidden — Master access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const { data: cfg } = await admin.from('ai_global_config').select('*').eq('id', true).maybeSingle()
  if (!cfg) {
    return new Response(JSON.stringify({ skipped: 'no config' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const provider = cfg.active_provider as Provider
  const model = cfg.active_model as string
  const result = await ping(provider, model)

  const failures = result.ok ? 0 : (cfg.consecutive_failures ?? 0) + 1
  await admin.from('ai_global_config').update({
    [`${provider}_tested_at`]: new Date().toISOString(),
    [`${provider}_test_ok`]: result.ok,
    [`${provider}_test_error`]: result.ok ? null : result.error,
    consecutive_failures: failures,
  }).eq('id', true)

  await admin.from('system_logs').insert({
    source: 'ai-global-healthcheck',
    level: result.ok ? 'info' : 'warn',
    event: 'ai_healthcheck',
    message: `Healthcheck ${provider}/${model} → ${result.ok ? 'OK' : `FAIL (${result.error})`}`,
    metadata: { provider, model, result, consecutive_failures: failures },
  }).then(() => undefined, () => undefined)

  // Alerta após 2 falhas consecutivas (somente uma vez por janela)
  if (!result.ok && failures === 2) {
    const { data: masters } = await admin
      .from('user_roles').select('user_id').eq('role', 'master')
    const masterIds = (masters ?? []).map((m: { user_id: string }) => m.user_id)
    if (masterIds.length) {
      const { data: profiles } = await admin
        .from('profiles').select('email, full_name').in('id', masterIds)
      const recipients = (profiles ?? []).map((p) => p.email).filter(Boolean) as string[]
      if (recipients.length) {
        await admin.functions.invoke('send-email', {
          body: {
            to: recipients,
            subject: `[ALERTA] IA Global indisponível — ${provider}/${model}`,
            html: `
              <h2>Provedor de IA com falhas consecutivas</h2>
              <p><strong>Provider:</strong> ${provider}</p>
              <p><strong>Modelo:</strong> ${model}</p>
              <p><strong>Erro:</strong> ${result.error}</p>
              <p><strong>Falhas consecutivas:</strong> ${failures}</p>
              <p>Acesse o painel Master &rarr; IA Global para verificar.</p>
            `,
          },
        }).then(() => undefined, () => undefined)
      }
    }
  }

  return new Response(JSON.stringify({ ok: result.ok, failures, error: result.error }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
