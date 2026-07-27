/**
 * enqueue-outbound-message — endpoint chamado pelo browser para enviar mensagens.
 *
 * Fast-path:
 *   1. Valida payload e enfileira em `outbound_message_queue` (via RPC, idempotente por client_id).
 *   2. Tenta despachar INLINE, ainda na mesma requisição:
 *        claim_outbound_message_by_id → loadSendContext → provider → persist → mark_sent.
 *      Isso elimina o salto extra Edge→Edge (boot do worker) e tipicamente
 *      derruba a latência ponta-a-ponta de ~2,5s para <800ms.
 *   3. Se algo falhar, `mark_outbound_failed` agenda backoff e o worker
 *      cron (`process-outbound-messages`, 1/min) reprocessa.
 *   4. Bug-out se o orçamento de tempo estourar (4s): retorna ok para o
 *      browser e deixa o worker terminar.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { dispatchOutbound, type QueueRow } from '../_shared/outbound-dispatch.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const INLINE_BUDGET_MS = 4000

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const auth = req.headers.get('Authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const clientId = body.client_id
  const conversationId = body.conversation_id
  const provider = body.provider
  const payload = body.payload

  if (!isUuid(clientId)) return new Response(JSON.stringify({ error: 'invalid_client_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (!isUuid(conversationId)) return new Response(JSON.stringify({ error: 'invalid_conversation_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  if (provider !== 'evolution' && provider !== 'cloud_api') {
    return new Response(JSON.stringify({ error: 'invalid_provider' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
  if (!payload || typeof payload !== 'object') {
    return new Response(JSON.stringify({ error: 'invalid_payload' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // Cliente com JWT do user para o enqueue (auth.uid() é validado no RPC).
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!,
    { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } },
  )

  const { data: enqueued, error: enqueueErr } = await userClient.rpc('enqueue_outbound_message', {
    _client_id: clientId,
    _conversation_id: conversationId,
    _provider: provider,
    _payload: payload,
  })

  if (enqueueErr) {
    console.error('[enqueue-outbound-message] rpc error:', enqueueErr.message)
    const status = /unauthenticated|conversation_not_in_company|company_inactive|no_company/.test(enqueueErr.message) ? 403 : 500
    return new Response(JSON.stringify({ error: enqueueErr.message }), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Fast-path inline. Usa service-role para claim+send+mark, evitando RLS no caminho crítico.
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const queuedRow = (enqueued as any) ?? null
  const queueId: string | null = queuedRow?.id ?? null

  // Se a enqueue retornou um item já em status pending (não duplicata) tentamos despachar inline.
  // Em caso de duplicata (mesmo client_id → status pode ser sent/failed), pulamos o inline.
  const inlinePromise: Promise<'success' | 'failed' | 'dead' | 'skipped'> = (async () => {
    if (!queueId || queuedRow?.status !== 'pending') return 'skipped'
    const { data: claimed, error: claimErr } = await adminClient.rpc('claim_outbound_message_by_id', { _id: queueId })
    if (claimErr) {
      console.error('[enqueue-outbound-message] claim error:', claimErr.message)
      return 'skipped'
    }
    const item = Array.isArray(claimed) ? claimed[0] : claimed
    if (!item) return 'skipped'  // worker já pegou — deixa com ele
    return dispatchOutbound(adminClient, item as QueueRow)
  })()

  // Race contra orçamento — não prendemos o browser além de 4s.
  const result = await Promise.race([
    inlinePromise,
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), INLINE_BUDGET_MS)),
  ])

  // Se estourou o orçamento, deixamos o inline continuar (no-op se já terminou) — sem await.
  if (result === 'timeout') {
    inlinePromise.catch((e) => console.error('[enqueue-outbound-message] inline tail error:', e?.message))
  }

  return new Response(
    JSON.stringify({
      ok: true,
      queued: queuedRow,
      dispatch: result,
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
