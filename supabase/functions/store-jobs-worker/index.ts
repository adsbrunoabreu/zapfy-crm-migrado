// store-jobs-worker: processa fila de jobs de integração de loja com backoff exponencial.
// Acionado por cron (a cada 1 min) ou invocação manual via store-proxy.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

import {
  shopifyTestConnection, shopifyFetchProductsPage, shopifyRegisterWebhooks,
  shopifyProductCount, SHOPIFY_WEBHOOK_TOPICS,
} from '../_shared/store-providers/shopify.ts'
import { readAdminToken } from '../_shared/store-providers/crypto.ts'
import { provGate } from '../_shared/provider-gate.ts'
import { denyIfNotInternal } from '../_shared/cron-guard.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Defaults caso a tabela de config esteja indisponível.
const DEFAULT_MAX_BATCH = 10
const DEFAULT_CONCURRENCY = 3
const DEFAULT_MAX_PER_COMPANY = 2
// Tempo máximo dedicado a um único job de sync por execução do worker.
// Se exceder, salva checkpoint e re-enfileira sem consumir tentativa.
const SYNC_TIME_BUDGET_MS = 50_000

function backoffSeconds(attempt: number) {
  // 30s, 2m, 8m, 30m, 2h
  const ladder = [30, 120, 480, 1800, 7200]
  return ladder[Math.min(attempt, ladder.length - 1)]
}

async function logEvent(admin: ReturnType<typeof createClient>, row: {
  company_id: string; integration_id?: string | null; job_id?: string | null;
  event_type: string; severity: 'info' | 'warning' | 'error'; message: string; details?: Record<string, unknown>;
}) {
  await admin.from('store_integration_logs').insert({
    company_id: row.company_id,
    store_integration_id: row.integration_id ?? null,
    job_id: row.job_id ?? null,
    event_type: row.event_type,
    severity: row.severity,
    message: row.message.slice(0, 500),
    details: row.details ?? {},
  })
}

async function ensureWebhooks(admin: ReturnType<typeof createClient>, integrationId: string, storeUrl: string, creds: { admin_token: string }) {
  const { data: cur } = await admin.from('store_integrations').select('webhook_secret').eq('id', integrationId).maybeSingle()
  let secret = cur?.webhook_secret as string | null
  if (!secret) {
    secret = crypto.randomUUID().replace(/-/g, '')
    await admin.from('store_integrations').update({ webhook_secret: secret }).eq('id', integrationId)
  }
  const callback = `${SUPABASE_URL}/functions/v1/shopify-webhook?integration_id=${integrationId}&token=${secret}`
  const registered = await shopifyRegisterWebhooks(storeUrl, creds, callback, SHOPIFY_WEBHOOK_TOPICS)
  await admin.from('store_integrations').update({
    webhooks: registered, webhooks_registered_at: new Date().toISOString(),
  }).eq('id', integrationId)
  return registered
}

/**
 * Sentinela usada para sinalizar que o sync foi pausado por time-budget e deve
 * ser retomado pelo próximo tick do worker (sem consumir tentativa).
 */
class SyncPausedError extends Error {
  constructor(public processedNow: number, public cursor: string | null, public page: number) {
    super('sync_paused_checkpoint')
  }
}

interface SyncCheckpoint {
  cursor: string | null
  page: number
  processed: number
}

async function loadCheckpoint(admin: ReturnType<typeof createClient>, integrationId: string): Promise<SyncCheckpoint> {
  const { data } = await admin.from('store_integrations')
    .select('sync_cursor, sync_page, sync_processed')
    .eq('id', integrationId).maybeSingle()
  return {
    cursor: (data?.sync_cursor as string | null) ?? null,
    page: (data?.sync_page as number | null) ?? 0,
    processed: (data?.sync_processed as number | null) ?? 0,
  }
}

async function saveCheckpoint(
  admin: ReturnType<typeof createClient>, integrationId: string,
  cursor: string | null, page: number, processed: number, totalKnown: number | null,
) {
  const patch: Record<string, unknown> = {
    sync_cursor: cursor,
    sync_page: page,
    sync_processed: processed,
    sync_progress: processed,
    sync_checkpoint_at: new Date().toISOString(),
  }
  if (totalKnown != null) patch.sync_total = totalKnown
  await admin.from('store_integrations').update(patch).eq('id', integrationId)
}

async function syncProductsJob(
  admin: ReturnType<typeof createClient>,
  integrationId: string, companyId: string,
  storeUrl: string, creds: { admin_token: string },
  startedAt: number, resume: boolean,
) {
  // Se for resume, parte do cursor salvo; caso contrário, zera checkpoint.
  let { cursor, page, processed } = resume
    ? await loadCheckpoint(admin, integrationId)
    : { cursor: null, page: 0, processed: 0 }
  if (!resume) {
    await saveCheckpoint(admin, integrationId, null, 0, 0, null)
  }

  // Loop paginado com persistência por página.
  while (true) {
    // Time budget: pausa e re-enfileira para continuar no próximo tick.
    if (Date.now() - startedAt > SYNC_TIME_BUDGET_MS) {
      throw new SyncPausedError(processed, cursor, page)
    }

    const { products, nextCursor, rawCount } = await shopifyFetchProductsPage(storeUrl, creds, cursor)
    if (products.length > 0) {
      // Upsert em batch (250 variantes por página max ~ até centenas de rows).
      const rows = products.map((p) => ({
        company_id: companyId, store_integration_id: integrationId,
        external_id: p.external_id, variant_id: p.variant_id, sku: p.sku,
        title: p.title, description: p.description, price: p.price,
        compare_at_price: p.compare_at_price, currency: p.currency, stock: p.stock,
        image_url: p.image_url, product_url: p.product_url, categories: p.categories,
        tags: p.tags, metadata: p.metadata, is_active: p.is_active,
        synced_at: new Date().toISOString(),
      }))
      const { error } = await admin.from('store_products')
        .upsert(rows, { onConflict: 'store_integration_id,external_id,variant_id' })
      if (error) throw new Error(`upsert_products_failed: ${error.message}`)
    }
    processed += rawCount
    page += 1
    cursor = nextCursor
    await saveCheckpoint(admin, integrationId, cursor, page, processed, null)

    if (!nextCursor) break
  }

  // Sync concluído — limpa cursor e marca status final.
  await admin.from('store_integrations').update({
    last_sync_at: new Date().toISOString(), last_sync_error: null,
    product_count: processed, status: 'active',
    sync_cursor: null, sync_page: 0, sync_processed: 0,
  }).eq('id', integrationId)
  return processed
}

async function processJob(admin: ReturnType<typeof createClient>, job: any) {
  const { id, company_id, store_integration_id, job_type } = job
  await logEvent(admin, { company_id, integration_id: store_integration_id, job_id: id, event_type: `job.${job_type}.start`, severity: 'info', message: `Iniciando job ${job_type}` })

  const { data: integ } = await admin.from('store_integrations')
    .select('id, store_url, credentials').eq('id', store_integration_id).maybeSingle()
  if (!integ) throw new Error('Integração não encontrada')
  const creds = { admin_token: await readAdminToken(integ.credentials as Record<string, unknown>) }

  // Gate por empresa: respeita rate limit Shopify e circuit breaker
  const gate = await provGate(admin, company_id, 'shopify')
  if (!gate.allowed) {
    // Devolve para a fila com retry curto e registra como falha leve
    throw new Error(`shopify_gated:${gate.reason}:retry_${gate.retry_after_sec}s`)
  }

  const startedAt = Date.now()
  let result: Record<string, unknown> = {}
  try {
    if (job_type === 'test') {
      result = await shopifyTestConnection(integ.store_url, creds) as Record<string, unknown>
      await admin.from('store_integrations').update({ last_sync_error: null, status: 'active' }).eq('id', integ.id)
    } else if (job_type === 'sync' || job_type === 'initial_sync') {
      // Resume = retomar do checkpoint salvo (initial_sync também retoma se houver cursor).
      const cp = await loadCheckpoint(admin, integ.id)
      const resume = !!cp.cursor || cp.processed > 0
      if (job_type === 'initial_sync' && !resume) {
        const total = await shopifyProductCount(integ.store_url, creds)
        await admin.from('store_integrations').update({
          sync_total: total, sync_phase: 'products',
          sync_started_at: new Date().toISOString(),
        }).eq('id', integ.id)
      }
      const count = await syncProductsJob(admin, integ.id, company_id, integ.store_url, creds, startedAt, resume)
      if (job_type === 'initial_sync') {
        await admin.from('store_integrations').update({ sync_phase: 'done', sync_finished_at: new Date().toISOString() }).eq('id', integ.id)
      }
      result = { count, resumed: resume }
    } else if (job_type === 'webhooks' || job_type === 'rotate_webhooks') {
      const wh = await ensureWebhooks(admin, integ.id, integ.store_url, creds)
      result = { count: wh.length }
    } else {
      throw new Error(`Tipo de job desconhecido: ${job_type}`)
    }
    await gate.success()
  } catch (e) {
    // SyncPausedError não conta como falha real para o gate/circuit breaker.
    if (!(e instanceof SyncPausedError)) {
      await gate.failure((e as Error).message)
    }
    throw e
  }
  return result
}

interface WorkerConfig {
  max_batch: number
  concurrency: number
  max_per_company: number
  enabled: boolean
}

async function loadConfig(admin: ReturnType<typeof createClient>): Promise<WorkerConfig> {
  const { data } = await admin.from('store_worker_config')
    .select('max_batch, concurrency, max_per_company, enabled')
    .eq('id', true).maybeSingle()
  return {
    max_batch: data?.max_batch ?? DEFAULT_MAX_BATCH,
    concurrency: data?.concurrency ?? DEFAULT_CONCURRENCY,
    max_per_company: data?.max_per_company ?? DEFAULT_MAX_PER_COMPANY,
    enabled: data?.enabled ?? true,
  }
}

async function handleJob(admin: ReturnType<typeof createClient>, job: any) {
  try {
    const result = await processJob(admin, job)
    await admin.from('store_integration_jobs').update({
      status: 'success', finished_at: new Date().toISOString(), last_error: null,
      payload: { ...(job.payload ?? {}), result },
    }).eq('id', job.id)
    await logEvent(admin, {
      company_id: job.company_id, integration_id: job.store_integration_id, job_id: job.id,
      event_type: `job.${job.job_type}.success`, severity: 'info',
      message: `Job ${job.job_type} concluído`, details: result,
    })
  } catch (e) {
    if (e instanceof SyncPausedError) {
      await admin.from('store_integration_jobs').update({
        status: 'pending',
        started_at: null,
        finished_at: null,
        attempts: (job.attempts ?? 0), // reverte incremento do claim
        next_run_at: new Date(Date.now() + 2_000).toISOString(),
        last_error: null,
      }).eq('id', job.id)
      await logEvent(admin, {
        company_id: job.company_id, integration_id: job.store_integration_id, job_id: job.id,
        event_type: `job.${job.job_type}.checkpoint`, severity: 'info',
        message: `Checkpoint salvo (página ${e.page}, ${e.processedNow} processados). Continuando.`,
        details: { page: e.page, cursor_present: !!e.cursor, processed: e.processedNow },
      })
      return
    }
    const errMsg = (e as Error).message
    const attempts = (job.attempts ?? 0) + 1
    const isFinal = attempts >= (job.max_attempts ?? 5)
    const nextRun = isFinal ? null : new Date(Date.now() + backoffSeconds(attempts) * 1000).toISOString()
    await admin.from('store_integration_jobs').update({
      status: isFinal ? 'failed' : 'pending',
      finished_at: isFinal ? new Date().toISOString() : null,
      next_run_at: nextRun ?? new Date().toISOString(),
      last_error: errMsg,
    }).eq('id', job.id)
    await logEvent(admin, {
      company_id: job.company_id, integration_id: job.store_integration_id, job_id: job.id,
      event_type: `job.${job.job_type}.${isFinal ? 'failed' : 'retry'}`,
      severity: isFinal ? 'error' : 'warning',
      message: errMsg, details: { attempts, max_attempts: job.max_attempts, next_run_at: nextRun },
    })
    if (isFinal) {
      await admin.from('store_integrations').update({
        last_sync_error: errMsg, status: 'error',
      }).eq('id', job.store_integration_id)
    }
  }
}

async function tick() {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const cfg = await loadConfig(admin)
  if (!cfg.enabled) return { processed: 0, config: cfg, skipped: 'worker_disabled' }

  const nowIso = new Date().toISOString()
  // Busca um pool maior que o batch para permitir filtro por empresa sem ficar sem jobs.
  const fetchLimit = Math.min(100, cfg.max_batch * 4)
  const { data: candidates } = await admin.from('store_integration_jobs')
    .select('*')
    .in('status', ['pending'])
    .lte('next_run_at', nowIso)
    .order('next_run_at', { ascending: true })
    .limit(fetchLimit)

  // Aplica fairness: limita N jobs por empresa por tick e respeita max_batch global.
  const perCompany = new Map<string, number>()
  const queue: any[] = []
  for (const j of candidates ?? []) {
    const cur = perCompany.get(j.company_id) ?? 0
    if (cur >= cfg.max_per_company) continue
    perCompany.set(j.company_id, cur + 1)
    queue.push(j)
    if (queue.length >= cfg.max_batch) break
  }

  // Pool de N workers concorrentes consumindo da fila compartilhada.
  let cursor = 0
  let processed = 0
  const runWorker = async () => {
    while (cursor < queue.length) {
      const job = queue[cursor++]
      // Atomic claim — apenas 1 worker pega o job.
      const { data: claimed } = await admin.from('store_integration_jobs')
        .update({ status: 'running', started_at: new Date().toISOString(), attempts: (job.attempts ?? 0) + 1 })
        .eq('id', job.id).eq('status', 'pending')
        .select('id').maybeSingle()
      if (!claimed) continue
      processed++
      await handleJob(admin, job)
    }
  }

  const workers = Math.max(1, Math.min(cfg.concurrency, queue.length))
  await Promise.all(Array.from({ length: workers }, () => runWorker()))
  return { processed, config: cfg, claimed_candidates: queue.length }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const denied = denyIfNotInternal(req, corsHeaders); if (denied) return denied

  try {
    const out = await tick()
    return new Response(JSON.stringify({ ok: true, ...out }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('store-jobs-worker error:', e)
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
