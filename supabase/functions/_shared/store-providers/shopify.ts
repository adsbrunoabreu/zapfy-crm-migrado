// Shopify provider for E-commerce add-on (Admin REST API 2024-10)
// Credentials shape: { admin_token: string }
// store_url should be the *.myshopify.com domain (e.g. "minha-loja.myshopify.com")

export interface ShopifyCreds {
  admin_token: string;
}

export interface NormalizedProduct {
  external_id: string;
  variant_id: string | null;
  sku: string | null;
  title: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  currency: string;
  stock: number | null;
  image_url: string | null;
  product_url: string | null;
  categories: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  is_active: boolean;
}

const apiBase = (storeUrl: string) =>
  `https://${storeUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/admin/api/2024-10`;

const headers = (creds: ShopifyCreds) => ({
  'X-Shopify-Access-Token': creds.admin_token,
  'Content-Type': 'application/json',
  Accept: 'application/json',
});

export async function shopifyTestConnection(storeUrl: string, creds: ShopifyCreds) {
  const r = await fetch(`${apiBase(storeUrl)}/shop.json`, { headers: headers(creds) });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Shopify test failed [${r.status}]: ${txt.slice(0, 200)}`);
  }
  const data = await r.json();
  const presentment = Array.isArray(data?.shop?.enabled_presentment_currencies)
    ? data.shop.enabled_presentment_currencies as string[]
    : [];
  return {
    name: data?.shop?.name as string,
    currency: (data?.shop?.currency as string) ?? 'BRL',
    domain: data?.shop?.domain as string,
    presentment_currencies: presentment,
  };
}

export async function shopifyProductCount(storeUrl: string, creds: ShopifyCreds): Promise<number> {
  const r = await fetch(`${apiBase(storeUrl)}/products/count.json`, { headers: headers(creds) });
  if (!r.ok) return 0;
  const data = await r.json();
  return Number(data?.count ?? 0);
}

// --- Webhooks --------------------------------------------------------------

export const SHOPIFY_WEBHOOK_TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
  'orders/create',
  'orders/updated',
  'orders/paid',
  'orders/cancelled',
  'orders/fulfilled',
  'inventory_levels/update',
] as const;

export interface RegisteredWebhook {
  id: number;
  topic: string;
  address: string;
}

export async function shopifyListWebhooks(storeUrl: string, creds: ShopifyCreds): Promise<RegisteredWebhook[]> {
  const r = await fetch(`${apiBase(storeUrl)}/webhooks.json?limit=250`, { headers: headers(creds) });
  if (!r.ok) throw new Error(`Shopify list webhooks [${r.status}]: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  return (data?.webhooks ?? []).map((w: any) => ({ id: w.id, topic: w.topic, address: w.address }));
}

export async function shopifyRegisterWebhooks(
  storeUrl: string,
  creds: ShopifyCreds,
  callbackUrl: string,
  topics: readonly string[] = SHOPIFY_WEBHOOK_TOPICS,
): Promise<RegisteredWebhook[]> {
  const existing = await shopifyListWebhooks(storeUrl, creds);
  const out: RegisteredWebhook[] = [];
  for (const topic of topics) {
    const match = existing.find((w) => w.topic === topic && w.address === callbackUrl);
    if (match) { out.push(match); continue; }
    const stale = existing.filter((w) => w.topic === topic);
    for (const s of stale) {
      await fetch(`${apiBase(storeUrl)}/webhooks/${s.id}.json`, { method: 'DELETE', headers: headers(creds) }).catch(() => {});
    }
    const r = await fetch(`${apiBase(storeUrl)}/webhooks.json`, {
      method: 'POST',
      headers: headers(creds),
      body: JSON.stringify({ webhook: { topic, address: callbackUrl, format: 'json' } }),
    });
    if (!r.ok) {
      console.error(`shopifyRegisterWebhooks ${topic}: ${r.status} ${(await r.text()).slice(0, 200)}`);
      continue;
    }
    const j = await r.json();
    if (j?.webhook) out.push({ id: j.webhook.id, topic: j.webhook.topic, address: j.webhook.address });
  }
  return out;
}

export async function shopifyDeleteWebhooks(storeUrl: string, creds: ShopifyCreds, ids: number[]): Promise<void> {
  for (const id of ids) {
    await fetch(`${apiBase(storeUrl)}/webhooks/${id}.json`, { method: 'DELETE', headers: headers(creds) }).catch(() => {});
  }
}

export async function shopifyFetchProductById(storeUrl: string, creds: ShopifyCreds, id: string | number) {
  const r = await fetch(`${apiBase(storeUrl)}/products/${id}.json`, { headers: headers(creds) });
  if (!r.ok) throw new Error(`Shopify fetch product [${r.status}]`);
  const data = await r.json();
  return data?.product ?? null;
}

function normalizeShopifyProduct(storeUrl: string, p: any): NormalizedProduct[] {
  const firstImg = p.images?.[0]?.src ?? p.image?.src ?? null;
  const tags: string[] = typeof p.tags === 'string' && p.tags
    ? p.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : [];
  const cats = p.product_type ? [p.product_type] : [];
  const productUrl = `https://${storeUrl}/products/${p.handle}`;
  const variants = p.variants ?? [];
  if (variants.length === 0) {
    return [{
      external_id: String(p.id),
      variant_id: null,
      sku: null,
      title: p.title,
      description: p.body_html ? stripHtml(p.body_html) : null,
      price: 0,
      compare_at_price: null,
      currency: 'BRL',
      stock: null,
      image_url: firstImg,
      product_url: productUrl,
      categories: cats,
      tags,
      metadata: { vendor: p.vendor, status: p.status },
      is_active: p.status === 'active',
    }];
  }
  return variants.map((v: any) => ({
    external_id: String(p.id),
    variant_id: String(v.id),
    sku: v.sku || null,
    title: variants.length > 1 ? `${p.title} — ${v.title}` : p.title,
    description: p.body_html ? stripHtml(p.body_html) : null,
    price: parseFloat(v.price ?? '0'),
    compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
    currency: 'BRL',
    stock: typeof v.inventory_quantity === 'number' ? v.inventory_quantity : null,
    image_url: firstImg,
    product_url: productUrl,
    categories: cats,
    tags,
    metadata: { vendor: p.vendor, status: p.status, variant_title: v.title },
    is_active: p.status === 'active',
  }));
}

const PAGE_SIZE = 250;

/**
 * Fetch a single page of products. Returns normalized rows + the cursor for the
 * next page (null when finished). Used for resumable, checkpointed sync.
 */
export async function shopifyFetchProductsPage(
  storeUrl: string,
  creds: ShopifyCreds,
  cursor: string | null,
): Promise<{ products: NormalizedProduct[]; nextCursor: string | null; rawCount: number }> {
  const url = cursor
    ? `${apiBase(storeUrl)}/products.json?limit=${PAGE_SIZE}&page_info=${encodeURIComponent(cursor)}`
    : `${apiBase(storeUrl)}/products.json?limit=${PAGE_SIZE}`;
  const r = await fetch(url, { headers: headers(creds) });
  if (!r.ok) throw new Error(`Shopify fetch failed [${r.status}]: ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const raw: any[] = data.products ?? [];
  const products: NormalizedProduct[] = [];
  for (const p of raw) products.push(...normalizeShopifyProduct(storeUrl, p));
  const link = r.headers.get('link') || r.headers.get('Link');
  const m = link?.match(/<([^>]+)>;\s*rel="next"/);
  let nextCursor: string | null = null;
  if (m) {
    try {
      const u = new URL(m[1]);
      nextCursor = u.searchParams.get('page_info');
    } catch { nextCursor = null; }
  }
  return { products, nextCursor, rawCount: raw.length };
}

export async function* shopifyFetchProducts(
  storeUrl: string,
  creds: ShopifyCreds,
): AsyncGenerator<NormalizedProduct> {
  let cursor: string | null = null;
  while (true) {
    const { products, nextCursor } = await shopifyFetchProductsPage(storeUrl, creds, cursor);
    for (const p of products) yield p;
    if (!nextCursor) break;
    cursor = nextCursor;
  }
}

export async function shopifyCreateCart(
  storeUrl: string,
  _creds: ShopifyCreds,
  items: Array<{ variant_id: string; quantity: number }>,
  discountCode?: string,
): Promise<{ checkoutUrl: string; externalId: string | null }> {
  // Use cart permalinks (no Storefront API token required).
  // https://shopify.dev/docs/storefronts/themes/architecture/templates/cart#cart-permalink
  const path = items.map((i) => `${i.variant_id}:${i.quantity}`).join(',');
  const qs = discountCode ? `?discount=${encodeURIComponent(discountCode)}` : '';
  const url = `https://${storeUrl}/cart/${path}${qs}`;
  return { checkoutUrl: url, externalId: null };
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
}
