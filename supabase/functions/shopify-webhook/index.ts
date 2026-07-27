// Public Shopify webhook receiver.
// Auth strategy (works for Shopify Custom Apps): integration_id + token in URL query string.
// URL pattern: /functions/v1/shopify-webhook?integration_id=<uuid>&token=<webhook_secret>
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { shopifyFetchProductById, type ShopifyCreds } from '../_shared/store-providers/shopify.ts'
import { readAdminToken } from '../_shared/store-providers/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const url = new URL(req.url)
    const integrationId = url.searchParams.get('integration_id')
    const token = url.searchParams.get('token')
    const topic = req.headers.get('x-shopify-topic') ?? ''
    const shopDomain = req.headers.get('x-shopify-shop-domain') ?? ''
    if (!integrationId || !token) return json({ error: 'missing auth' }, 401)
    if (!topic) return json({ error: 'missing topic' }, 400)

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    const { data: integ } = await admin
      .from('store_integrations')
      .select('id, company_id, store_url, credentials, webhook_secret')
      .eq('id', integrationId)
      .maybeSingle()
    if (!integ || integ.webhook_secret !== token) return json({ error: 'unauthorized' }, 401)
    if (shopDomain && !integ.store_url.toLowerCase().includes(shopDomain.toLowerCase())) {
      return json({ error: 'shop mismatch' }, 401)
    }

    const payload = await req.json().catch(() => ({}))
    const externalId = payload?.id ? String(payload.id) : null

    // Persist event for auditing
    const { data: evt } = await admin.from('store_webhook_events').insert({
      company_id: integ.company_id,
      store_integration_id: integ.id,
      topic,
      external_id: externalId,
      payload,
    }).select('id').maybeSingle()

    let processError: string | null = null
    try {
      await processEvent(admin, integ as any, topic, payload)
    } catch (e) {
      processError = (e as Error).message
      console.error('shopify-webhook process error:', topic, processError)
    }

    if (evt?.id) {
      await admin.from('store_webhook_events').update({
        processed_at: new Date().toISOString(),
        error: processError,
      }).eq('id', evt.id)
    }

    return json({ ok: true })
  } catch (e) {
    console.error('shopify-webhook fatal:', e)
    return json({ error: (e as Error).message }, 500)
  }
})

async function processEvent(
  admin: ReturnType<typeof createClient>,
  integ: { id: string; company_id: string; store_url: string; credentials: ShopifyCreds },
  topic: string,
  payload: any,
) {
  const companyId = integ.company_id
  const integrationId = integ.id

  if (topic === 'products/delete') {
    const externalId = String(payload?.id ?? '')
    if (!externalId) return
    await admin.from('store_products').delete()
      .eq('store_integration_id', integrationId)
      .eq('external_id', externalId)
    return
  }

  if (topic === 'products/create' || topic === 'products/update') {
    let product = payload
    if (!product?.title || !product?.variants) {
      const token = await readAdminToken((integ.credentials ?? {}) as Record<string, unknown>)
      product = await shopifyFetchProductById(integ.store_url, { admin_token: token } as ShopifyCreds, payload?.id)
    }
    if (!product) return
    await upsertShopifyProduct(admin, companyId, integrationId, integ.store_url, product)
    return
  }

  if (topic === 'inventory_levels/update') {
    // Best-effort: we don't have a direct mapping inventory_item_id → variant; trigger a partial refresh later.
    return
  }

  if (topic.startsWith('orders/')) {
    // Persist a lightweight order record into store_carts is out-of-scope here;
    // event row already saved for downstream processors / AI agent.
    return
  }
}

async function upsertShopifyProduct(
  admin: ReturnType<typeof createClient>,
  companyId: string,
  integrationId: string,
  storeUrl: string,
  p: any,
) {
  const tags: string[] = typeof p.tags === 'string' && p.tags
    ? p.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : []
  const cats = p.product_type ? [p.product_type] : []
  const productUrl = `https://${storeUrl}/products/${p.handle}`
  const firstImg = p.images?.[0]?.src ?? p.image?.src ?? null
  const variants = p.variants ?? []
  const stripHtml = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000)
  const isActive = p.status === 'active'
  const description = p.body_html ? stripHtml(p.body_html) : null
  const externalId = String(p.id)

  if (variants.length === 0) {
    await admin.from('store_products').upsert({
      company_id: companyId,
      store_integration_id: integrationId,
      external_id: externalId,
      variant_id: null,
      sku: null,
      title: p.title,
      description,
      price: 0,
      compare_at_price: null,
      currency: 'BRL',
      stock: null,
      image_url: firstImg,
      product_url: productUrl,
      categories: cats,
      tags,
      metadata: { vendor: p.vendor, status: p.status },
      is_active: isActive,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'store_integration_id,external_id,variant_id' })
    return
  }

  for (const v of variants) {
    await admin.from('store_products').upsert({
      company_id: companyId,
      store_integration_id: integrationId,
      external_id: externalId,
      variant_id: String(v.id),
      sku: v.sku || null,
      title: variants.length > 1 ? `${p.title} — ${v.title}` : p.title,
      description,
      price: parseFloat(v.price ?? '0'),
      compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
      currency: 'BRL',
      stock: typeof v.inventory_quantity === 'number' ? v.inventory_quantity : null,
      image_url: firstImg,
      product_url: productUrl,
      categories: cats,
      tags,
      metadata: { vendor: p.vendor, status: p.status, variant_title: v.title },
      is_active: isActive,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'store_integration_id,external_id,variant_id' })
  }
}
