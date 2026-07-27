// store-cart-create: chamado por ai-agent-runner ou frontend para gerar carrinho/checkout
// Auth: x-internal-key === SUPABASE_SERVICE_ROLE_KEY OU JWT do usuário
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
import { shopifyCreateCart } from '../_shared/store-providers/shopify.ts'
import { readAdminToken } from '../_shared/store-providers/crypto.ts'

interface ItemInput { sku?: string; product_id?: string; variant_id?: string; quantity: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const internal = req.headers.get('x-internal-key')
    const auth = req.headers.get('Authorization')
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    let companyId = ''
    let isInternal = false
    if (internal && internal === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')) {
      isInternal = true
    } else if (auth?.startsWith('Bearer ')) {
      const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: auth } },
      })
      const { data: claims } = await supa.auth.getClaims(auth.replace('Bearer ', ''))
      if (!claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const { data: profile } = await admin.from('profiles').select('company_id').eq('id', claims.claims.sub).maybeSingle()
      companyId = profile?.company_id ?? ''
    } else {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    if (isInternal) companyId = String(body.company_id ?? '')
    const items = (body.items ?? []) as ItemInput[]
    const conversationId = body.conversation_id ? String(body.conversation_id) : null
    const leadId = body.lead_id ? String(body.lead_id) : null
    const couponCode = body.coupon_code ? String(body.coupon_code) : undefined

    if (!companyId || !Array.isArray(items) || items.length === 0) {
      return new Response(JSON.stringify({ error: 'company_id and items required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: integ } = await admin.from('store_integrations').select('id, provider, store_url, credentials, currency').eq('company_id', companyId).maybeSingle()
    if (!integ) {
      return new Response(JSON.stringify({ error: 'No store connected' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Resolve cada item para variant_id + price (necessário p/ Shopify cart permalink)
    const resolved: Array<{ variant_id: string; quantity: number; price: number; title: string; image_url: string | null }> = []
    for (const it of items) {
      const q = Math.max(1, Math.min(99, Number(it.quantity) || 1))
      let query = admin.from('store_products').select('variant_id, external_id, price, title, image_url').eq('company_id', companyId).limit(1)
      if (it.variant_id) query = query.eq('variant_id', String(it.variant_id))
      else if (it.sku) query = query.eq('sku', String(it.sku))
      else if (it.product_id) query = query.eq('external_id', String(it.product_id))
      const { data: prod } = await query.maybeSingle()
      if (!prod?.variant_id) continue
      resolved.push({ variant_id: prod.variant_id, quantity: q, price: Number(prod.price ?? 0), title: prod.title, image_url: prod.image_url })
    }
    if (resolved.length === 0) {
      return new Response(JSON.stringify({ error: 'No matching products' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Validar cupom se fornecido
    let appliedCoupon: string | undefined
    if (couponCode) {
      const subtotal = resolved.reduce((s, r) => s + r.price * r.quantity, 0)
      const { data: coupon } = await admin.from('store_coupons').select('*').eq('company_id', companyId).eq('code', couponCode).eq('is_active', true).maybeSingle()
      if (coupon
        && coupon.agent_can_offer !== false
        && (!coupon.valid_from || new Date(coupon.valid_from) <= new Date())
        && (!coupon.valid_until || new Date(coupon.valid_until) >= new Date())
        && (coupon.min_order_value == null || subtotal >= Number(coupon.min_order_value))
        && (coupon.max_uses == null || coupon.uses_count < coupon.max_uses)
      ) {
        appliedCoupon = coupon.code
      }
    }

    let result: { checkoutUrl: string; externalId: string | null }
    if (integ.provider === 'shopify') {
      const adminToken = await readAdminToken((integ.credentials ?? {}) as Record<string, unknown>)
      result = await shopifyCreateCart(integ.store_url, { admin_token: adminToken } as any, resolved.map((r) => ({ variant_id: r.variant_id, quantity: r.quantity })), appliedCoupon)
    } else {
      return new Response(JSON.stringify({ error: 'Provider not supported' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const total = resolved.reduce((s, r) => s + r.price * r.quantity, 0)
    const { data: cart } = await admin.from('store_carts').insert({
      company_id: companyId,
      store_integration_id: integ.id,
      conversation_id: conversationId,
      lead_id: leadId,
      external_cart_id: result.externalId,
      checkout_url: result.checkoutUrl,
      items: resolved.map((r) => ({ variant_id: r.variant_id, quantity: r.quantity, price: r.price, title: r.title, image_url: r.image_url })),
      total,
      currency: integ.currency,
      coupon_code: appliedCoupon,
      status: 'open',
    }).select('id').maybeSingle()

    return new Response(JSON.stringify({
      ok: true,
      cart_id: cart?.id,
      checkout_url: result.checkoutUrl,
      total,
      currency: integ.currency,
      coupon_applied: appliedCoupon ?? null,
      items: resolved,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('store-cart-create error:', e)
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
