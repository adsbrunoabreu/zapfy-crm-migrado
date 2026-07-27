/**
 * webhook-router — entrada FINA de webhooks (Evolution + Cloud API).
 *
 * Responsabilidades (e SOMENTE estas):
 *   1. Validar autenticação básica do request:
 *        - Cloud API: exige header `x-hub-signature-256`.
 *        - Evolution: exige header `apikey` ou `x-evolution-apikey`.
 *   2. Detectar provider e validar payload mínimo.
 *   3. Inserir o payload bruto + headers em `webhook_inbox`.
 *   4. Retornar 200 imediatamente (alvo <50ms).
 *
 * O processamento pesado (HMAC contra appSecret, normalização, persistência,
 * download de mídia, ACKs) é executado de forma assíncrona pelos workers
 * `process-webhook-inbox` e `process-media-fetch-jobs`.
 *
 * Erros internos retornam 5xx (NÃO 200 silencioso) para que o provider
 * tente novamente. Bad payload / auth ausente retorna 4xx.
 *
 * Verify JWT: NÃO. Webhooks externos são validados por assinatura/headers.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-hub-signature-256, x-evolution-apikey',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const REPLAY_WINDOW_SEC = 60 * 10

type DetectedProvider = 'cloud_api' | 'evolution' | 'unknown'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function detectProvider(headers: Headers, payload: unknown): DetectedProvider {
  if (headers.get('x-hub-signature-256')) return 'cloud_api'
  if (headers.get('apikey') || headers.get('x-evolution-apikey')) return 'evolution'

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (
      obj.object === 'whatsapp_business_account' ||
      (Array.isArray(obj.entry) && obj.entry.length > 0)
    ) {
      return 'cloud_api'
    }
    if (typeof obj.event === 'string' && (obj.instance || obj.data)) {
      return 'evolution'
    }
  }
  return 'unknown'
}

function isReplayTimestampSafe(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return true
  const obj = payload as Record<string, unknown>
  let tsSec: number | null = null
  try {
    if (Array.isArray(obj.entry)) {
      const change = (obj.entry as Array<Record<string, unknown>>)[0]
      const changes = (change?.changes as Array<Record<string, unknown>>) ?? []
      const value = (changes[0]?.value as Record<string, unknown>) ?? {}
      const messages = value.messages as Array<Record<string, unknown>> | undefined
      const t = messages?.[0]?.timestamp
      if (t) tsSec = Number(t)
    } else if (obj.data && typeof obj.data === 'object') {
      const d = obj.data as Record<string, unknown>
      if (typeof d.messageTimestamp === 'number') tsSec = d.messageTimestamp
      else if (typeof obj.date_time === 'string') tsSec = Math.floor(new Date(obj.date_time).getTime() / 1000)
    }
  } catch {
    return true
  }
  if (!tsSec || !Number.isFinite(tsSec)) return true
  const nowSec = Math.floor(Date.now() / 1000)
  return Math.abs(nowSec - tsSec) <= REPLAY_WINDOW_SEC
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // ── GET → Meta Cloud API verification handshake ──────────────────────
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && token && challenge) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
      // 1) Per-instance token
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('id')
        .eq('provider', 'cloud_api')
        .filter('config->>webhookVerifyToken', 'eq', token)
        .limit(1)
        .maybeSingle()
      if (data) {
        return new Response(challenge, { status: 200, headers: corsHeaders })
      }
      // 2) Global token (Painel Master → Integrações → WhatsApp Cloud)
      const { data: glob } = await supabase
        .from('system_integrations')
        .select('value')
        .eq('key', 'whatsapp_cloud')
        .maybeSingle()
      const globalToken = (glob?.value as any)?.verify_token
      if (globalToken && globalToken === token) {
        return new Response(challenge, { status: 200, headers: corsHeaders })
      }
      return jsonResponse({ error: 'verify_token mismatch' }, 403)
    }
    return jsonResponse({ ok: true, ping: 'webhook-router' }, 200)
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  // Lê o body bruto UMA vez. Mantemos o raw em `payload._raw_body` para que
  // o worker possa recomputar HMAC contra `appSecret`.
  const rawBody = await req.text()
  let payload: Record<string, unknown>
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {}
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  const provider = detectProvider(req.headers, payload)

  if (provider === 'unknown') {
    return jsonResponse({ error: 'unknown_provider' }, 400)
  }

  // ── Auth obrigatória por provider ──────────────────────────────────
  if (provider === 'cloud_api') {
    const sig = req.headers.get('x-hub-signature-256')
    if (!sig || !/^sha256=[a-f0-9]{64}$/i.test(sig)) {
      return jsonResponse({ error: 'missing_or_invalid_signature' }, 401)
    }
  } else if (provider === 'evolution') {
    const apikey = req.headers.get('apikey') ?? req.headers.get('x-evolution-apikey')
    if (!apikey || apikey.trim().length < 8) {
      return jsonResponse({ error: 'missing_apikey' }, 401)
    }
  }

  if (!isReplayTimestampSafe(payload)) {
    // Aceita com 200 para não disparar retry, descarta.
    return jsonResponse({ ok: true, ignored: 'stale_timestamp' }, 200)
  }

  // ── Headers serializados (apenas relevantes — economiza espaço) ─────
  const headersObj: Record<string, string> = {}
  for (const [k, v] of req.headers.entries()) {
    const lk = k.toLowerCase()
    if (
      lk === 'apikey' ||
      lk === 'x-evolution-apikey' ||
      lk === 'x-hub-signature-256' ||
      lk === 'content-type' ||
      lk === 'user-agent'
    ) {
      headersObj[lk] = v
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

  try {
    const { error } = await supabase.from('webhook_inbox').insert({
      provider,
      payload: { ...payload, _raw_body: rawBody },
      headers: headersObj,
    })
    if (error) {
      console.error('[webhook-router] inbox insert failed:', error.message)
      // 5xx → provider reentrega. NÃO retornamos 200 silencioso.
      return jsonResponse({ error: 'inbox_insert_failed', detail: error.message }, 500)
    }
  } catch (err) {
    const msg = (err as Error)?.message ?? 'unknown'
    console.error('[webhook-router] unexpected:', msg)
    return jsonResponse({ error: 'internal_error', detail: msg }, 500)
  }

  // Dispara o worker IMEDIATAMENTE (fire-and-forget) para reduzir a latência
  // de "mensagem chegou no servidor" → "mensagem aparece no chat" de até
  // 60s (cron 1/min) para ~1-2s. O cron continua como backstop.
  try {
    void supabase.functions.invoke('process-webhook-inbox', { body: { trigger: 'router' } })
      .catch((e) => console.error('[webhook-router] inbox worker invoke failed:', e?.message))
  } catch (e) {
    console.error('[webhook-router] inbox worker dispatch error:', (e as Error)?.message)
  }

  return jsonResponse({ ok: true, queued: true, provider }, 200)
})
