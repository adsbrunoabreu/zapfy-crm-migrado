// Master-only: gerencia o provedor/modelo global de IA + testa chaves.
// Endpoints: action=get | save | test | test_all | history
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type Provider = 'lovable' | 'anthropic' | 'openai' | 'google'

const DEFAULT_MODELS: Record<Provider, string> = {
  lovable: 'google/gemini-3-flash-preview',
  anthropic: 'claude-sonnet-4-5-20250929',
  openai: 'gpt-5',
  google: 'gemini-2.5-flash',
}

const ENV_KEY: Record<Provider, string | null> = {
  lovable: 'LOVABLE_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_AI_API_KEY',
}

// Whitelist de modelos por provedor — bloqueia strings arbitrárias
const MODEL_REGEX: Record<Provider, RegExp> = {
  anthropic: /^claude-(sonnet|opus|haiku)-\d+(-\d+)?-\d{8}$/,
  openai: /^gpt-(5|5-mini|5-nano|4\.1|4o)(-[a-z0-9-]+)?$/i,
  google: /^gemini-\d+(\.\d+)?(-[a-z0-9-]+)+$/i,
  lovable: /^(google|openai|anthropic)\/[a-z0-9.\-_/]+$/i,
}

const RATE_LIMIT_SECONDS = 10
const TEST_TIMEOUT_MS = 10_000

function maskHttpError(status: number, body: string): string {
  if (status === 401 || status === 403) return 'Chave de API inválida ou sem permissão'
  if (status === 404) return 'Modelo inexistente ou indisponível'
  if (status === 429) return 'Rate limit do provedor excedido'
  if (status >= 500) return 'Provedor indisponível no momento'
  if (status === 400) {
    // tentativa de extrair mensagem curta sem expor metadados
    const m = body.match(/"message"\s*:\s*"([^"]{1,120})"/)
    return m ? `Requisição inválida: ${m[1]}` : 'Requisição inválida'
  }
  return `Falha (HTTP ${status})`
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function testProvider(provider: Provider, model: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const keyName = ENV_KEY[provider]
    const apiKey = keyName ? Deno.env.get(keyName) : null
    if (!apiKey) return { ok: false, error: `${keyName} não configurada` }

    let r: Response
    if (provider === 'anthropic') {
      r = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
      })
    } else if (provider === 'openai') {
      r = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, max_completion_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
      })
    } else if (provider === 'google') {
      r = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }) },
      )
    } else if (provider === 'lovable') {
      r = await fetchWithTimeout('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }] }),
      })
    } else {
      return { ok: false, error: 'provider inválido' }
    }

    if (!r.ok) {
      const body = await r.text().catch(() => '')
      return { ok: false, error: maskHttpError(r.status, body) }
    }
    return { ok: true }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { ok: false, error: 'Timeout (10s) — provedor não respondeu' }
    }
    return { ok: false, error: 'Erro de rede ao contatar provedor' }
  }
}

function validateModel(provider: Provider, model: string): string | null {
  if (!model || model.length > 200) return 'Modelo inválido (vazio ou longo demais)'
  if (!MODEL_REGEX[provider].test(model)) {
    return `Formato de modelo inválido para ${provider}. Verifique a documentação oficial.`
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing auth' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } })
  const { data: userData } = await userClient.auth.getUser()
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: isMaster } = await admin.rpc('has_role', { _user_id: userData.user.id, _role: 'master' })
  if (!isMaster) {
    return new Response(JSON.stringify({ error: 'Forbidden — master only' }), {
      status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const userId = userData.user.id
  const body = await req.json().catch(() => ({}))
  const action: string = body.action || 'get'

  const keysConfigured = {
    anthropic: !!Deno.env.get('ANTHROPIC_API_KEY'),
    openai: !!Deno.env.get('OPENAI_API_KEY'),
    google: !!Deno.env.get('GOOGLE_AI_API_KEY'),
    lovable: !!Deno.env.get('LOVABLE_API_KEY'),
  }

  const audit = (event: string, message: string, metadata: Record<string, unknown>, level = 'info') =>
    admin.from('system_logs').insert({ source: 'ai-global-config', level, event, message, metadata })
      .then(() => undefined, () => undefined)

  if (action === 'get') {
    const { data: cfg } = await admin.from('ai_global_config').select('*').eq('id', true).maybeSingle()
    return new Response(JSON.stringify({ config: cfg, keysConfigured, defaults: DEFAULT_MODELS }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (action === 'history') {
    const { data: logs } = await admin
      .from('system_logs')
      .select('id, created_at, message, metadata')
      .eq('source', 'ai-global-config')
      .eq('event', 'ai_model_changed')
      .order('created_at', { ascending: false })
      .limit(20)
    return new Response(JSON.stringify({ history: logs ?? [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (action === 'test' || action === 'test_all') {
    const providers: Provider[] = action === 'test_all'
      ? ['anthropic', 'openai', 'google', 'lovable']
      : [body.provider as Provider]

    const results: Record<string, { ok: boolean; error?: string }> = {}
    for (const provider of providers) {
      if (!provider || !ENV_KEY[provider]) { results[provider] = { ok: false, error: 'provider inválido' }; continue }

      // Rate limit
      const { data: rl } = await admin.from('ai_config_rate_limit')
        .select('last_test_at').eq('user_id', userId).eq('provider', provider).maybeSingle()
      if (rl?.last_test_at) {
        const elapsed = (Date.now() - new Date(rl.last_test_at).getTime()) / 1000
        if (elapsed < RATE_LIMIT_SECONDS) {
          results[provider] = { ok: false, error: `Aguarde ${Math.ceil(RATE_LIMIT_SECONDS - elapsed)}s antes de testar novamente` }
          continue
        }
      }

      const model = (action === 'test_all' ? DEFAULT_MODELS[provider] : (body.model as string)) || DEFAULT_MODELS[provider]
      const modelErr = validateModel(provider, model)
      if (modelErr) { results[provider] = { ok: false, error: modelErr }; continue }

      const result = await testProvider(provider, model)
      results[provider] = result

      await admin.from('ai_config_rate_limit').upsert(
        { user_id: userId, provider, last_test_at: new Date().toISOString() },
        { onConflict: 'user_id,provider' },
      )
      await admin.from('ai_global_config').update({
        [`${provider}_tested_at`]: new Date().toISOString(),
        [`${provider}_test_ok`]: result.ok,
        [`${provider}_test_error`]: result.ok ? null : result.error,
      }).eq('id', true)

      await audit('ai_provider_tested',
        `Teste ${provider}/${model} → ${result.ok ? 'OK' : 'FAIL'}`,
        { provider, model, result, by: userId },
        result.ok ? 'info' : 'warn')
    }

    if (action === 'test_all') {
      return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    return new Response(JSON.stringify(results[providers[0]]), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  if (action === 'save') {
    const provider = body.provider as Provider
    const model = (body.model as string) || DEFAULT_MODELS[provider]
    if (!provider || !ENV_KEY[provider]) {
      await audit('ai_save_rejected', 'provider inválido', { provider, by: userId }, 'warn')
      return new Response(JSON.stringify({ error: 'provider inválido' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const modelErr = validateModel(provider, model)
    if (modelErr) {
      await audit('ai_save_rejected', modelErr, { provider, model, by: userId }, 'warn')
      return new Response(JSON.stringify({ error: modelErr }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (provider !== 'lovable' && !Deno.env.get(ENV_KEY[provider]!)) {
      await audit('ai_save_rejected', 'chave ausente', { provider, by: userId }, 'warn')
      return new Response(JSON.stringify({ error: `Configure ${ENV_KEY[provider]} antes de ativar` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: prev } = await admin.from('ai_global_config')
      .select('active_provider, active_model').eq('id', true).maybeSingle()

    const patch: Record<string, unknown> = {
      active_provider: provider,
      active_model: model,
      model_active_at: new Date().toISOString(),
      updated_by: userId,
      consecutive_failures: 0,
      [`${provider}_model`]: model,
    }
    const { error: upErr } = await admin.from('ai_global_config').update(patch).eq('id', true)
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    await audit('ai_model_changed',
      `Modelo IA global alterado de ${prev?.active_provider}/${prev?.active_model} para ${provider}/${model}`,
      { previous: prev, next: { provider, model }, changed_by: userId })

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ error: 'action inválida' }), {
    status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
