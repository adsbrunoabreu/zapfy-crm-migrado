/**
 * webhooks-dispatcher
 * --------------------------------------------------------------------------
 * Worker único responsável por:
 *   1. Drenar a fila `webhook_events_queue` (modo dispatch / cron)
 *   2. Reprocessar entregas pendentes em `webhook_deliveries` (modo retry)
 *   3. Disparar payload de teste (`{ action: "test", webhook_id }`)
 *   4. Reenviar uma entrega anterior (`{ action: "resend", delivery_id }`)
 *
 * Padrão HTTP de saída (compatível com n8n / Make / Zapier):
 *   Content-Type: application/json
 *   User-Agent: CRM-Webhooks/2.0
 *   X-Webhook-Event              <event>
 *   X-Webhook-Delivery           <delivery_id>           # único por tentativa
 *   X-Webhook-Correlation-Id     <correlation_id>        # estável p/ idempotência
 *   X-Webhook-Timestamp          <unix_ts>
 *   X-Webhook-Signature          t=<ts>,v1=<hmac_hex>
 *   X-Webhook-Signature-256      sha256=<hmac_hex>
 *   X-Webhook-Attempt            <n>
 *
 * Assinatura: HMAC_SHA256(secret, `${ts}.${raw_body}`)
 *
 * Verify JWT: NÃO (chamada via cron com apikey).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(SUPABASE_URL, SERVICE_KEY)

const HTTP_TIMEOUT_MS = 15_000
const MAX_EVENTS_PER_RUN = 50
const MAX_RETRIES_PER_RUN = 50
// Backoff em segundos: 30s, 2m, 10m, 30m, 2h, 6h
const BACKOFF_SECONDS = [30, 120, 600, 1800, 7200, 21600]

// ---------------------------------------------------------------------------
// HMAC helpers
// ---------------------------------------------------------------------------
async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// uuid v5-like (deterministic) a partir de SHA-1(name)
async function deterministicUuid(name: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(name))
  const b = Array.from(new Uint8Array(buf)).slice(0, 16)
  // versão 5
  b[6] = (b[6] & 0x0f) | 0x50
  // variante RFC 4122
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = b.map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function businessKey(event: string, payload: Record<string, unknown>): string {
  switch (event) {
    case 'message.received':
    case 'message.sent':
      return `msg:${payload.message_id}`
    case 'lead.created':
      return `lead.created:${payload.lead_id}`
    case 'lead.stage_changed':
      return `lead.stage:${payload.lead_id}:${payload.from_stage_id ?? ''}->${payload.to_stage_id ?? ''}:${Date.now()}`
    case 'lead.transferred':
      return `lead.transfer:${payload.lead_id}:${payload.from_assigned_to ?? ''}->${payload.to_assigned_to ?? ''}:${Date.now()}`
    case 'lead.updated':
      return `lead.updated:${payload.lead_id}:${Date.now()}`
    default:
      return `${event}:${JSON.stringify(payload)}`
  }
}

// ---------------------------------------------------------------------------
// Enriquecimento
// ---------------------------------------------------------------------------
async function getCompany(companyId: string) {
  const { data } = await admin
    .from('companies')
    .select('id,name')
    .eq('id', companyId)
    .maybeSingle()
  return data
}

async function getLead(leadId: string) {
  if (!leadId) return null
  const { data } = await admin.from('leads').select('*').eq('id', leadId).maybeSingle()
  return data
}

async function getConversation(convId: string) {
  if (!convId) return null
  const { data } = await admin.from('conversations').select('*').eq('id', convId).maybeSingle()
  return data
}

async function getInstanceByConversation(convId: string) {
  if (!convId) return null
  const { data: conv } = await admin
    .from('conversations')
    .select('instance_id,instance_name,company_id')
    .eq('id', convId)
    .maybeSingle()
  if (!conv) return null
  if (conv.instance_id) {
    const { data } = await admin
      .from('whatsapp_instances')
      .select('id,instance_name,display_name,phone_connected,status,provider')
      .eq('id', conv.instance_id)
      .maybeSingle()
    if (data) return data
  }
  const { data } = await admin
    .from('whatsapp_instances')
    .select('id,instance_name,display_name,phone_connected,status,provider')
    .eq('company_id', conv.company_id)
    .eq('instance_name', conv.instance_name)
    .maybeSingle()
  return data
}

async function signMediaUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null
  const { data } = await admin.storage.from('chat-media').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

// Constrói o payload final ao receber um evento da fila
async function buildEventPayload(
  event: string,
  rawPayload: Record<string, any>,
  companyId: string
): Promise<{ data: any; context: any; instanceId: string | null; previous: any | null }> {
  let data: any = rawPayload
  let context: any = {}
  let instanceId: string | null = null
  let previous: any = null

  if (event === 'message.received' || event === 'message.sent') {
    const conv = await getConversation(rawPayload.conversation_id)
    const instance = await getInstanceByConversation(rawPayload.conversation_id)
    instanceId = instance?.id ?? null
    const lead = conv?.lead_id ? await getLead(conv.lead_id) : null
    const mediaUrl = await signMediaUrl(rawPayload.media_storage_path)
    data = {
      id: rawPayload.message_id,
      conversation_id: rawPayload.conversation_id,
      remote_jid: rawPayload.remote_jid,
      type: rawPayload.message_type,
      content: rawPayload.content,
      from_me: rawPayload.from_me,
      status: rawPayload.status,
      sender_name: rawPayload.sender_name,
      timestamp: rawPayload.timestamp,
      provider_message_id: rawPayload.provider_message_id,
      media: rawPayload.media_storage_path
        ? {
            url: mediaUrl,
            mimetype: rawPayload.media_mimetype,
            file_name: rawPayload.file_name,
            duration: rawPayload.duration,
          }
        : null,
    }
    context = {
      conversation: conv,
      instance,
      lead,
    }
  } else if (event === 'lead.created') {
    const lead = await getLead(rawPayload.lead_id)
    data = lead
    context = { lead }
  } else if (event === 'lead.stage_changed') {
    const lead = await getLead(rawPayload.lead_id)
    const [{ data: fromStage }, { data: toStage }] = await Promise.all([
      rawPayload.from_stage_id
        ? admin.from('pipeline_stages').select('id,name').eq('id', rawPayload.from_stage_id).maybeSingle()
        : Promise.resolve({ data: null }),
      rawPayload.to_stage_id
        ? admin.from('pipeline_stages').select('id,name').eq('id', rawPayload.to_stage_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    data = {
      lead_id: rawPayload.lead_id,
      pipeline_id: rawPayload.pipeline_id,
      from_stage: fromStage,
      to_stage: toStage,
    }
    context = { lead }
  } else if (event === 'lead.transferred') {
    const lead = await getLead(rawPayload.lead_id)
    data = {
      lead_id: rawPayload.lead_id,
      from_assigned_to: rawPayload.from_assigned_to,
      to_assigned_to: rawPayload.to_assigned_to,
    }
    context = { lead }
  } else if (event === 'lead.updated') {
    const lead = await getLead(rawPayload.lead_id)
    data = lead
    previous = rawPayload.changes ?? null
    context = { lead }
  }

  const company = await getCompany(companyId)
  context.company = company
  return { data, context, instanceId, previous }
}

// ---------------------------------------------------------------------------
// Selecionar webhooks aplicáveis
// ---------------------------------------------------------------------------
async function findMatchingWebhooks(companyId: string, event: string, instanceId: string | null) {
  const { data: hooks } = await admin
    .from('webhooks')
    .select('id,url,secret,events,instance_ids,is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)
  if (!hooks) return []
  return hooks.filter((wh) => {
    const events: string[] = wh.events ?? []
    const matchesEvent =
      events.length === 0 || events.includes('*') || events.includes(event)
    if (!matchesEvent) return false
    if ((event === 'message.received' || event === 'message.sent') && instanceId) {
      const ids: string[] = wh.instance_ids ?? []
      if (ids.length > 0 && !ids.includes(instanceId)) return false
    }
    return true
  })
}

// ---------------------------------------------------------------------------
// Envio HTTP
// ---------------------------------------------------------------------------
async function sendDelivery(deliveryId: string) {
  const { data: delivery, error } = await admin
    .from('webhook_deliveries')
    .select('*, webhook:webhooks(id,url,is_active)')
    .eq('id', deliveryId)
    .maybeSingle()
  if (error || !delivery) {
    console.error('delivery not found', deliveryId, error)
    return
  }
  const wh = delivery.webhook
  if (!wh || !wh.is_active) {
    await admin
      .from('webhook_deliveries')
      .update({
        status: 'dead',
        last_error: 'Webhook inativo ou removido',
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
    return
  }

  // Busca o segredo em texto plano (descriptografado pela RPC, só service_role)
  const { data: plainSecret, error: secretErr } = await admin.rpc(
    'get_webhook_secret_plaintext',
    { _webhook_id: wh.id }
  )
  if (secretErr || !plainSecret) {
    await admin
      .from('webhook_deliveries')
      .update({
        status: 'dead',
        last_error: `Não foi possível obter o segredo: ${secretErr?.message ?? 'vazio'}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
    return
  }

  const attempt = (delivery.attempt ?? 0) + 1
  const ts = Math.floor(Date.now() / 1000).toString()
  const body = JSON.stringify(delivery.payload)
  const signature = await hmacHex(plainSecret as string, `${ts}.${body}`)

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'CRM-Webhooks/2.0',
    'X-Webhook-Event': delivery.event,
    'X-Webhook-Delivery': delivery.id,
    'X-Webhook-Correlation-Id': delivery.correlation_id,
    'X-Webhook-Timestamp': ts,
    'X-Webhook-Signature': `t=${ts},v1=${signature}`,
    'X-Webhook-Signature-256': `sha256=${signature}`,
    'X-Webhook-Attempt': String(attempt),
  }

  const startedAt = Date.now()
  let status = 0
  let respBody = ''
  let errMsg: string | null = null

  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
    const resp = await fetch(wh.url, {
      method: 'POST',
      headers,
      body,
      signal: ctrl.signal,
    })
    clearTimeout(t)
    status = resp.status
    respBody = (await resp.text()).slice(0, 4000)
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e)
  }

  const durationMs = Date.now() - startedAt
  const success = status >= 200 && status < 300
  const isClientError = status >= 400 && status < 500 && status !== 408 && status !== 429

  let nextStatus: 'success' | 'failed' | 'dead' | 'pending'
  let nextAttemptAt: string | null = null
  if (success) {
    nextStatus = 'success'
  } else if (isClientError || attempt >= (delivery.max_attempts ?? 6)) {
    nextStatus = 'dead'
  } else {
    nextStatus = 'pending'
    const idx = Math.min(attempt - 1, BACKOFF_SECONDS.length - 1)
    nextAttemptAt = new Date(Date.now() + BACKOFF_SECONDS[idx] * 1000).toISOString()
  }

  await admin
    .from('webhook_deliveries')
    .update({
      attempt,
      status: nextStatus,
      next_attempt_at: nextAttemptAt ?? new Date().toISOString(),
      last_request_headers: headers,
      last_response_status: status || null,
      last_response_body: respBody || null,
      last_error: errMsg,
      duration_ms: durationMs,
      delivered_at: success ? new Date().toISOString() : delivery.delivered_at,
      updated_at: new Date().toISOString(),
    })
    .eq('id', deliveryId)

  // Alerta quando virar 'dead' — uma notificação por admin da empresa
  if (nextStatus === 'dead') {
    try {
      const { data: admins } = await admin
        .from('user_roles')
        .select('user_id')
        .eq('company_id', delivery.company_id)
        .in('role', ['admin', 'master'])
      const rows = (admins ?? []).map((a: any) => ({
        user_id: a.user_id,
        company_id: delivery.company_id,
        type: 'webhook_failure',
        title: 'Webhook falhou definitivamente',
        message: `Evento ${delivery.event} para ${wh.url} falhou após ${attempt} tentativas (HTTP ${status || 'erro'})`,
        severity: 'error',
        link: '/settings?tab=webhooks',
        metadata: {
          webhook_id: wh.id,
          delivery_id: delivery.id,
          correlation_id: delivery.correlation_id,
          event: delivery.event,
        },
      }))
      if (rows.length > 0) await admin.from('app_notifications').insert(rows)
    } catch (e) {
      console.warn('failed to insert app_notification', e)
    }
  }
}

// ---------------------------------------------------------------------------
// Drenar fila
// ---------------------------------------------------------------------------
async function drainQueue() {
  // 1. Pega lote pendente
  const { data: events, error } = await admin
    .from('webhook_events_queue')
    .select('id,company_id,event,payload')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(MAX_EVENTS_PER_RUN)
  if (error) {
    console.error('queue select error', error)
    return { processed: 0, deliveries: 0 }
  }
  if (!events || events.length === 0) return { processed: 0, deliveries: 0 }

  // Marca como pegos
  const ids = events.map((e) => e.id)
  await admin
    .from('webhook_events_queue')
    .update({ picked_at: new Date().toISOString() })
    .in('id', ids)

  let createdDeliveries = 0
  for (const ev of events) {
    try {
      const built = await buildEventPayload(ev.event, ev.payload, ev.company_id)
      const hooks = await findMatchingWebhooks(ev.company_id, ev.event, built.instanceId)
      for (const wh of hooks) {
        const correlationId = await deterministicUuid(
          `corr|${ev.company_id}|${ev.event}|${businessKey(ev.event, ev.payload)}`
        )
        const deliveryId = crypto.randomUUID()
        const occurredAt = new Date().toISOString()
        const payload = {
          id: deliveryId,
          correlation_id: correlationId,
          event: ev.event,
          occurred_at: occurredAt,
          company: built.context.company ?? null,
          data: built.data,
          previous: built.previous,
          context: {
            lead: built.context.lead ?? null,
            conversation: built.context.conversation ?? null,
            instance: built.context.instance ?? null,
          },
        }
        const { error: insErr } = await admin.from('webhook_deliveries').insert({
          id: deliveryId,
          webhook_id: wh.id,
          company_id: ev.company_id,
          event: ev.event,
          correlation_id: correlationId,
          payload,
          status: 'pending',
          attempt: 0,
          next_attempt_at: new Date().toISOString(),
        })
        if (insErr) {
          console.error('insert delivery error', insErr)
          continue
        }
        createdDeliveries++
        // Dispara imediatamente (best-effort, não aguarda)
        sendDelivery(deliveryId).catch((e) => console.error('sendDelivery err', e))
      }
    } catch (e) {
      console.error('process queue event error', ev.id, e)
    } finally {
      await admin
        .from('webhook_events_queue')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', ev.id)
    }
  }

  return { processed: events.length, deliveries: createdDeliveries }
}

// ---------------------------------------------------------------------------
// Reprocessar pendências
// ---------------------------------------------------------------------------
async function processPendingRetries() {
  const { data: pending } = await admin
    .from('webhook_deliveries')
    .select('id')
    .eq('status', 'pending')
    .gt('attempt', 0)
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(MAX_RETRIES_PER_RUN)
  if (!pending || pending.length === 0) return 0
  for (const d of pending) {
    await sendDelivery(d.id)
  }
  return pending.length
}

// ---------------------------------------------------------------------------
// HTTP entrypoint
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  let body: any = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const action = body.action ?? 'dispatch'

  try {
    if (action === 'dispatch') {
      const drained = await drainQueue()
      const retried = await processPendingRetries()
      return new Response(
        JSON.stringify({ ok: true, drained, retried }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'test') {
      const webhookId = String(body.webhook_id ?? '')
      if (!webhookId) {
        return new Response(JSON.stringify({ error: 'webhook_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: wh } = await admin
        .from('webhooks')
        .select('id,company_id')
        .eq('id', webhookId)
        .maybeSingle()
      if (!wh) {
        return new Response(JSON.stringify({ error: 'webhook not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const correlationId = crypto.randomUUID()
      const deliveryId = crypto.randomUUID()
      const company = await getCompany(wh.company_id)
      const payload = {
        id: deliveryId,
        correlation_id: correlationId,
        event: 'webhook.test',
        occurred_at: new Date().toISOString(),
        company,
        data: { message: 'Este é um evento de teste enviado pelo CRM.' },
        previous: null,
        context: {},
      }
      await admin.from('webhook_deliveries').insert({
        id: deliveryId,
        webhook_id: wh.id,
        company_id: wh.company_id,
        event: 'webhook.test',
        correlation_id: correlationId,
        payload,
        status: 'pending',
        attempt: 0,
      })
      await sendDelivery(deliveryId)
      return new Response(JSON.stringify({ ok: true, delivery_id: deliveryId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'resend') {
      const oldId = String(body.delivery_id ?? '')
      if (!oldId) {
        return new Response(JSON.stringify({ error: 'delivery_id is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: orig } = await admin
        .from('webhook_deliveries')
        .select('*')
        .eq('id', oldId)
        .maybeSingle()
      if (!orig) {
        return new Response(JSON.stringify({ error: 'delivery not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const newId = crypto.randomUUID()
      // Atualiza payload.id para refletir a nova tentativa
      const newPayload = { ...(orig.payload as any), id: newId, occurred_at: new Date().toISOString() }
      await admin.from('webhook_deliveries').insert({
        id: newId,
        webhook_id: orig.webhook_id,
        company_id: orig.company_id,
        event: orig.event,
        correlation_id: orig.correlation_id,
        payload: newPayload,
        status: 'pending',
        attempt: 0,
      })
      await sendDelivery(newId)
      return new Response(JSON.stringify({ ok: true, delivery_id: newId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('dispatcher error', e)
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
