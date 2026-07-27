// store-proxy: API administrativa para o frontend (conectar/testar/sincronizar/desconectar loja)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
import {
  shopifyTestConnection, shopifyFetchProducts, shopifyRegisterWebhooks, shopifyDeleteWebhooks,
  shopifyProductCount,
  SHOPIFY_WEBHOOK_TOPICS, type NormalizedProduct,
} from '../_shared/store-providers/shopify.ts'
import { buildCredentials, readAdminToken, tokenLast4 } from '../_shared/store-providers/crypto.ts'

async function resolveCreds(credentials: unknown): Promise<{ admin_token: string }> {
  const token = await readAdminToken((credentials ?? {}) as Record<string, unknown>)
  return { admin_token: token }
}

// Background-task helper compatible with Deno Deploy / Supabase edge runtime.
function runInBackground(promise: Promise<unknown>) {
  // @ts-ignore EdgeRuntime is provided by the Supabase runtime
  if (typeof EdgeRuntime !== 'undefined' && typeof EdgeRuntime.waitUntil === 'function') {
    // @ts-ignore
    EdgeRuntime.waitUntil(promise.catch((e) => console.error('bg task error:', e)))
  } else {
    promise.catch((e) => console.error('bg task error:', e))
  }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const webhookCallbackUrl = (integrationId: string, secret: string) =>
  `${SUPABASE_URL}/functions/v1/shopify-webhook?integration_id=${integrationId}&token=${secret}`

async function ensureShopifyWebhooks(admin: ReturnType<typeof createClient>, integrationId: string, storeUrl: string, creds: { admin_token: string }) {
  // Generate or reuse the integration's webhook secret
  const { data: cur } = await admin.from('store_integrations').select('webhook_secret').eq('id', integrationId).maybeSingle()
  let secret = cur?.webhook_secret as string | null
  if (!secret) {
    secret = crypto.randomUUID().replace(/-/g, '')
    await admin.from('store_integrations').update({ webhook_secret: secret }).eq('id', integrationId)
  }
  const callback = webhookCallbackUrl(integrationId, secret)
  const registered = await shopifyRegisterWebhooks(storeUrl, creds, callback, SHOPIFY_WEBHOOK_TOPICS)
  await admin.from('store_integrations').update({
    webhooks: registered,
    webhooks_registered_at: new Date().toISOString(),
  }).eq('id', integrationId)
  return registered
}

interface UserCtx {
  userId: string
  companyId: string
  isAdmin: boolean
  isMaster: boolean
}

async function getUserCtx(req: Request): Promise<UserCtx | null> {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const supa = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: auth } } },
  )
  const { data: claims } = await supa.auth.getClaims(auth.replace('Bearer ', ''))
  if (!claims?.claims?.sub) return null
  const userId = claims.claims.sub as string
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const [{ data: profile }, { data: roles }] = await Promise.all([
    admin.from('profiles').select('company_id').eq('id', userId).maybeSingle(),
    admin.from('user_roles').select('role').eq('user_id', userId),
  ])
  const roleSet = new Set((roles ?? []).map((r) => r.role))
  return {
    userId,
    companyId: profile?.company_id ?? '',
    isAdmin: roleSet.has('admin'),
    isMaster: roleSet.has('master'),
  }
}

async function syncProducts(
  admin: ReturnType<typeof createClient>,
  integrationId: string,
  companyId: string,
  storeUrl: string,
  creds: { admin_token: string },
  onProgress?: (count: number) => Promise<void>,
) {
  let count = 0
  for await (const p of shopifyFetchProducts(storeUrl, creds) as AsyncGenerator<NormalizedProduct>) {
    await admin.from('store_products').upsert({
      company_id: companyId,
      store_integration_id: integrationId,
      external_id: p.external_id,
      variant_id: p.variant_id,
      sku: p.sku,
      title: p.title,
      description: p.description,
      price: p.price,
      compare_at_price: p.compare_at_price,
      currency: p.currency,
      stock: p.stock,
      image_url: p.image_url,
      product_url: p.product_url,
      categories: p.categories,
      tags: p.tags,
      metadata: p.metadata,
      is_active: p.is_active,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'store_integration_id,external_id,variant_id' })
    count++
    if (onProgress && count % 10 === 0) await onProgress(count)
  }
  await admin.from('store_integrations').update({
    last_sync_at: new Date().toISOString(),
    last_sync_error: null,
    product_count: count,
    status: 'active',
  }).eq('id', integrationId)
  return count
}

const MAX_SYNC_ATTEMPTS = 3

async function runInitialSync(
  admin: ReturnType<typeof createClient>,
  integrationId: string,
  companyId: string,
  storeUrl: string,
  creds: { admin_token: string },
) {
  const updatePhase = (patch: Record<string, unknown>) =>
    admin.from('store_integrations').update(patch).eq('id', integrationId)

  // Increment attempts and reset progress
  const { data: cur } = await admin.from('store_integrations')
    .select('sync_attempts').eq('id', integrationId).maybeSingle()
  const attempt = ((cur?.sync_attempts as number) ?? 0) + 1

  await updatePhase({
    sync_phase: 'starting',
    sync_progress: 0,
    sync_total: 0,
    sync_started_at: new Date().toISOString(),
    sync_finished_at: null,
    sync_attempts: attempt,
    sync_error: null,
    status: 'active',
  })

  try {
    // Phase 1 — shop info / currencies
    await updatePhase({ sync_phase: 'shop_info' })
    const shop = await shopifyTestConnection(storeUrl, creds)
    await updatePhase({
      currency: shop.currency || 'BRL',
      presentment_currencies: shop.presentment_currencies ?? [],
    })

    // Phase 2 — count products to set the progress bar denominator
    await updatePhase({ sync_phase: 'counting' })
    const total = await shopifyProductCount(storeUrl, creds)
    await updatePhase({ sync_total: total })

    // Phase 3 — products
    await updatePhase({ sync_phase: 'products' })
    await syncProducts(admin, integrationId, companyId, storeUrl, creds, async (count) => {
      await updatePhase({ sync_progress: count })
    })

    // Phase 4 — webhooks (best-effort, recorded as warning)
    await updatePhase({ sync_phase: 'webhooks' })
    let webhookWarning: string | null = null
    try {
      await ensureShopifyWebhooks(admin, integrationId, storeUrl, creds)
    } catch (e) {
      webhookWarning = (e as Error).message
      console.error('initial_sync webhook register failed:', webhookWarning)
    }

    await updatePhase({
      sync_phase: 'done',
      sync_finished_at: new Date().toISOString(),
      sync_error: webhookWarning ? `webhooks: ${webhookWarning}` : null,
    })
  } catch (e) {
    const msg = (e as Error).message
    console.error('initial_sync error:', msg)
    await updatePhase({
      sync_phase: 'error',
      sync_finished_at: new Date().toISOString(),
      sync_error: msg,
      status: 'error',
      last_sync_error: msg,
    })
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const ctx = await getUserCtx(req)
    if (!ctx) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (!ctx.isAdmin && !ctx.isMaster) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const body = await req.json().catch(() => ({}))
    const action = body?.action as string
    const companyId = ctx.isMaster && body?.company_id ? String(body.company_id) : ctx.companyId
    if (!companyId) {
      return new Response(JSON.stringify({ error: 'company_id missing' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'list_unconnected') {
      if (!ctx.isMaster) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: integ } = await admin.from('store_integrations').select('company_id')
      const connectedIds = new Set((integ ?? []).map((r: any) => r.company_id))
      const { data: companies } = await admin
        .from('companies')
        .select('id, name, ecommerce_enabled, plan_status')
        .eq('ecommerce_enabled', true)
        .order('name')
      const rows = (companies ?? []).filter((c: any) => !connectedIds.has(c.id))
      return new Response(JSON.stringify({ companies: rows }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'list_all') {
      if (!ctx.isMaster) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: integrations } = await admin
        .from('store_integrations')
        .select('id, company_id, provider, display_name, store_url, currency, status, product_count, last_sync_at, last_sync_error, created_at, token_last4, token_rotated_at')
        .order('created_at', { ascending: false })
      const companyIds = Array.from(new Set((integrations ?? []).map((i: any) => i.company_id)))
      const { data: companies } = companyIds.length
        ? await admin.from('companies').select('id, name, ecommerce_enabled').in('id', companyIds)
        : { data: [] as any[] }
      const byId = new Map((companies ?? []).map((c: any) => [c.id, c]))
      const rows = (integrations ?? []).map((i: any) => ({
        ...i,
        company_name: byId.get(i.company_id)?.name ?? '—',
        ecommerce_enabled: byId.get(i.company_id)?.ecommerce_enabled ?? false,
      }))
      return new Response(JSON.stringify({ integrations: rows }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'test') {
      const { data: integ } = await admin
        .from('store_integrations')
        .select('id, store_url, credentials, provider')
        .eq('company_id', companyId)
        .maybeSingle()
      if (!integ) return new Response(JSON.stringify({ error: 'No integration' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      try {
        const creds = await resolveCreds(integ.credentials)
        const result = await shopifyTestConnection(integ.store_url, creds)
        await admin.from('store_integrations').update({
          last_sync_error: null,
          status: 'active',
        }).eq('id', integ.id)
        return new Response(JSON.stringify({ ok: true, shop: result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } catch (e) {
        const msg = (e as Error).message
        await admin.from('store_integrations').update({
          last_sync_error: msg,
          status: 'error',
        }).eq('id', integ.id)
        return new Response(JSON.stringify({ ok: false, error: msg }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
    }

    if (action === 'connect_shopify' || action === 'rotate_token') {
      const isRotate = action === 'rotate_token'
      const adminToken = String(body.admin_token ?? '').trim()
      if (!adminToken) {
        return new Response(JSON.stringify({ error: 'admin_token required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      let storeUrl: string
      let displayName: string
      let existingId: string | null = null
      if (isRotate) {
        const { data: existing } = await admin.from('store_integrations')
          .select('id, store_url, display_name').eq('company_id', companyId).maybeSingle()
        if (!existing) return new Response(JSON.stringify({ error: 'No integration to rotate' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        storeUrl = existing.store_url
        displayName = existing.display_name
        existingId = existing.id
      } else {
        storeUrl = String(body.store_url ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
        displayName = String(body.display_name ?? storeUrl).slice(0, 80)
        if (!storeUrl) {
          return new Response(JSON.stringify({ error: 'store_url required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }
      }

      // Validate token against Shopify before persisting
      const test = await shopifyTestConnection(storeUrl, { admin_token: adminToken })
      const encryptedCreds = await buildCredentials(adminToken)
      const nowIso = new Date().toISOString()

      const upsertPayload: Record<string, unknown> = {
        company_id: companyId,
        provider: 'shopify',
        display_name: displayName || test.name,
        store_url: storeUrl,
        currency: test.currency || 'BRL',
        status: 'active',
        credentials: encryptedCreds,
        token_last4: tokenLast4(adminToken),
        token_rotated_at: nowIso,
        last_sync_error: null,
      }
      const { data: integ, error } = await admin.from('store_integrations')
        .upsert(upsertPayload, { onConflict: 'company_id' })
        .select('id').maybeSingle()
      if (error) throw error
      const integrationId = integ?.id ?? existingId!

      // Persist presentment currencies discovered on connect
      await admin.from('store_integrations').update({
        presentment_currencies: test.presentment_currencies ?? [],
      }).eq('id', integrationId)

      // Kick off the initial sync as a background job. The UI polls sync_status.
      if (!isRotate) {
        const credsForJob = { admin_token: adminToken }
        runInBackground(runInitialSync(admin, integrationId, companyId, storeUrl, credsForJob))
      } else {
        // Rotation: just refresh webhooks (best-effort, foreground)
        try {
          await ensureShopifyWebhooks(admin, integrationId, storeUrl, { admin_token: adminToken })
        } catch (e) {
          console.error('rotate_token webhook register failed:', (e as Error).message)
        }
      }

      await admin.from('store_integration_logs').insert({
        company_id: companyId, store_integration_id: integrationId,
        event_type: isRotate ? 'token.rotated' : 'integration.connected',
        severity: 'info',
        message: isRotate ? 'Token rotacionado' : `Loja ${storeUrl} conectada`,
        details: { triggered_by: ctx.userId, last4: tokenLast4(adminToken) },
      })
      return new Response(JSON.stringify({
        ok: true,
        integration_id: integrationId,
        rotated: isRotate,
        token_last4: tokenLast4(adminToken),
        token_rotated_at: nowIso,
        shop: test,
        sync_started: !isRotate,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'initial_sync') {
      const { data: integ } = await admin.from('store_integrations')
        .select('id, store_url, credentials, sync_phase, sync_attempts')
        .eq('company_id', companyId).maybeSingle()
      if (!integ) return new Response(JSON.stringify({ error: 'No integration' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      // Block re-entrancy if already running
      const phase = (integ.sync_phase ?? '') as string
      if (phase && phase !== 'done' && phase !== 'error') {
        return new Response(JSON.stringify({ ok: true, already_running: true, phase }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      // Stop after MAX_SYNC_ATTEMPTS unless caller explicitly resets
      const force = body.force === true
      if (!force && phase === 'error' && (integ.sync_attempts ?? 0) >= MAX_SYNC_ATTEMPTS) {
        return new Response(JSON.stringify({
          error: `Limite de tentativas atingido (${MAX_SYNC_ATTEMPTS}). Reenvie com force=true para reprocessar.`,
        }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      if (force) {
        await admin.from('store_integrations').update({ sync_attempts: 0 }).eq('id', integ.id)
      }
      const creds = await resolveCreds(integ.credentials)
      runInBackground(runInitialSync(admin, integ.id, companyId, integ.store_url, creds))
      return new Response(JSON.stringify({ ok: true, started: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'sync_status') {
      const { data: integ } = await admin.from('store_integrations')
        .select('id, sync_phase, sync_progress, sync_total, sync_started_at, sync_finished_at, sync_attempts, sync_error, last_sync_at, last_sync_error, product_count, currency, presentment_currencies, status')
        .eq('company_id', companyId).maybeSingle()
      if (!integ) return new Response(JSON.stringify({ error: 'No integration' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      return new Response(JSON.stringify({ ok: true, sync: integ }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'register_webhooks') {
      const { data: integ } = await admin.from('store_integrations')
        .select('id, store_url, credentials').eq('company_id', companyId).maybeSingle()
      if (!integ) return new Response(JSON.stringify({ error: 'No integration' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      const creds = await resolveCreds(integ.credentials)
      const wh = await ensureShopifyWebhooks(admin, integ.id, integ.store_url, creds)
      return new Response(JSON.stringify({ ok: true, webhooks: wh }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'sync') {
      const { data: integ } = await admin.from('store_integrations').select('id, store_url, credentials').eq('company_id', companyId).maybeSingle()
      if (!integ) return new Response(JSON.stringify({ error: 'No integration' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      try {
        const creds = await resolveCreds(integ.credentials)
        const count = await syncProducts(admin, integ.id, companyId, integ.store_url, creds)
        return new Response(JSON.stringify({ ok: true, count }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      } catch (e) {
        await admin.from('store_integrations').update({
          last_sync_error: (e as Error).message,
          status: 'error',
        }).eq('id', integ.id)
        throw e
      }
    }

    if (action === 'disconnect') {
      const { data: integ } = await admin.from('store_integrations')
        .select('id, store_url, credentials, webhooks').eq('company_id', companyId).maybeSingle()
      if (!integ) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      // Best-effort cleanup of Shopify-side webhooks before deleting the row
      try {
        const ids = Array.isArray(integ.webhooks) ? (integ.webhooks as any[]).map((w) => Number(w.id)).filter(Boolean) : []
        if (ids.length) {
          const creds = await resolveCreds(integ.credentials)
          await shopifyDeleteWebhooks(integ.store_url, creds, ids)
        }
      } catch (e) {
        console.error('disconnect webhook cleanup error:', (e as Error).message)
      }
      await admin.from('store_integrations').delete().eq('id', integ.id)
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'enqueue_job') {
      const jobType = String(body.job_type ?? '')
      if (!['test','sync','webhooks','initial_sync','rotate_webhooks'].includes(jobType)) {
        return new Response(JSON.stringify({ error: 'job_type inválido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: integ } = await admin.from('store_integrations').select('id').eq('company_id', companyId).maybeSingle()
      if (!integ) return new Response(JSON.stringify({ error: 'No integration' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      const { data: job } = await admin.from('store_integration_jobs').insert({
        company_id: companyId, store_integration_id: integ.id, job_type: jobType,
        max_attempts: Number(body.max_attempts ?? 5), payload: body.payload ?? {},
      }).select('id').maybeSingle()
      await admin.from('store_integration_logs').insert({
        company_id: companyId, store_integration_id: integ.id, job_id: job?.id ?? null,
        event_type: `job.${jobType}.enqueued`, severity: 'info',
        message: `Job ${jobType} enfileirado`, details: { triggered_by: ctx.userId },
      })
      // Tenta processar imediatamente sem esperar o cron
      try {
        await admin.functions.invoke('store-jobs-worker', { body: {} })
      } catch (e) {
        console.error('worker invoke failed:', (e as Error).message)
      }
      return new Response(JSON.stringify({ ok: true, job_id: job?.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'list_jobs') {
      const limit = Math.min(Number(body.limit ?? 50), 200)
      const { data: jobs } = await admin.from('store_integration_jobs')
        .select('id, job_type, status, attempts, max_attempts, next_run_at, last_error, started_at, finished_at, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit)
      return new Response(JSON.stringify({ ok: true, jobs: jobs ?? [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'list_logs') {
      const limit = Math.min(Number(body.limit ?? 100), 500)
      const { data: logs } = await admin.from('store_integration_logs')
        .select('id, event_type, severity, message, details, job_id, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(limit)
      return new Response(JSON.stringify({ ok: true, logs: logs ?? [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (action === 'cancel_job') {
      const jobId = String(body.job_id ?? '')
      if (!jobId) return new Response(JSON.stringify({ error: 'job_id required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      await admin.from('store_integration_jobs').update({
        status: 'cancelled', finished_at: new Date().toISOString(),
      }).eq('id', jobId).eq('company_id', companyId).in('status', ['pending'])
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('store-proxy error:', e)
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
