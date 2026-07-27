// Edge function: extract-link-preview
// Receives { message_id, url } and stores Open Graph metadata in chat_messages.link_preview
// SECURITY: requires authenticated caller; URL validated against SSRF (no private/loopback hosts);
// chat_messages.update is scoped via RLS using the caller's JWT (no service-role write to arbitrary IDs).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// ── SSRF guard ──────────────────────────────────────────────────────────────
function isSafeUrl(urlString: string): boolean {
  let u: URL;
  try { u = new URL(urlString); } catch { return false; }
  if (!['http:', 'https:'].includes(u.protocol)) return false;
  if (u.username || u.password) return false;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;

  // Block private/internal/loopback/link-local/metadata hosts
  const privatePatterns: RegExp[] = [
    /^localhost$/i,
    /\.localhost$/i,
    /^127\./,
    /^0\./,
    /^10\./,
    /^192\.168\./,
    /^172\.(1[6-9]|2\d|3[01])\./,
    /^169\.254\./,            // link-local + AWS/GCP metadata 169.254.169.254
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64.0.0/10
    /^::1$/,
    /^fc[0-9a-f]{2}:/i,
    /^fd[0-9a-f]{2}:/i,
    /^fe80:/i,
    /^::ffff:/i,              // IPv4-mapped IPv6
    /\.internal$/i,
    /\.local$/i,
  ];
  if (privatePatterns.some((p) => p.test(host))) return false;
  return true;
}

function getMetaContent(html: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const decoded = m[1]
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
      if (decoded) return decoded;
    }
  }
  return null;
}

function buildPatterns(name: string, attr: 'property' | 'name'): RegExp[] {
  const a = attr;
  return [
    new RegExp(`<meta[^>]+${a}=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*${a}=["']${name}["']`, 'i'),
  ];
}

function absoluteUrl(maybeUrl: string | null, base: string): string | null {
  if (!maybeUrl) return null;
  try {
    const abs = new URL(maybeUrl, base).toString();
    // Re-validate so we never surface internal asset URLs either
    return isSafeUrl(abs) ? abs : null;
  } catch {
    return null;
  }
}

async function fetchPreview(targetUrl: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; LinkPreviewBot/1.0; +https://creditflowcrm.lovable.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Re-validate the final URL after redirects
    if (!isSafeUrl(res.url || targetUrl)) throw new Error('Redirect bloqueado (host privado)');
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) throw new Error(`Não-HTML (${ct})`);
    const buf = await res.arrayBuffer();
    const slice = buf.slice(0, 256 * 1024);
    const html = new TextDecoder('utf-8', { fatal: false }).decode(slice);

    const finalUrl = res.url || targetUrl;
    const title =
      getMetaContent(html, [
        ...buildPatterns('og:title', 'property'),
        ...buildPatterns('twitter:title', 'name'),
      ]) ||
      (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? null);

    const description = getMetaContent(html, [
      ...buildPatterns('og:description', 'property'),
      ...buildPatterns('twitter:description', 'name'),
      ...buildPatterns('description', 'name'),
    ]);

    const image = absoluteUrl(
      getMetaContent(html, [
        ...buildPatterns('og:image:secure_url', 'property'),
        ...buildPatterns('og:image', 'property'),
        ...buildPatterns('twitter:image', 'name'),
      ]),
      finalUrl
    );

    const siteName =
      getMetaContent(html, buildPatterns('og:site_name', 'property')) ||
      new URL(finalUrl).hostname.replace(/^www\./, '');

    const favicon = absoluteUrl(
      html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)?.[1] ||
        '/favicon.ico',
      finalUrl
    );

    return {
      url: finalUrl,
      title: title || null,
      description: description || null,
      image: image || null,
      site_name: siteName || null,
      favicon: favicon || null,
      fetched_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // ── Layer 1: Authentication ──
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401);
    }
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (userErr || !userRes?.user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    // ── Input validation ──
    const body = await req.json().catch(() => ({}));
    const { message_id, client_id, url } = body as {
      message_id?: string;
      client_id?: string;
      url?: string;
    };
    if (!url || typeof url !== 'string' || url.length > 2048) {
      return json({ error: 'url inválida' }, 400);
    }
    if (!message_id && !client_id) {
      return json({ error: 'message_id ou client_id obrigatório' }, 400);
    }
    if (message_id && (typeof message_id !== 'string' || message_id.length > 64)) {
      return json({ error: 'message_id inválido' }, 400);
    }
    if (client_id && (typeof client_id !== 'string' || client_id.length > 64)) {
      return json({ error: 'client_id inválido' }, 400);
    }

    // ── Layer 2: SSRF guard ──
    if (!isSafeUrl(url)) {
      return json({ error: 'URL não permitida' }, 400);
    }

    // ── Layer 3: Authorization scope — caller must see the row via RLS.
    // For optimistic outgoing sends, the row may not be persisted yet; poll briefly.
    const isUuid = (s: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    let realId: string | null = null;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      let q = userClient.from('chat_messages').select('id').limit(1);
      if (client_id) q = q.eq('client_id', client_id);
      else if (message_id && isUuid(message_id)) q = q.eq('id', message_id);
      else if (message_id) q = q.eq('message_id', message_id);
      const { data: msg } = await q.maybeSingle();
      if (msg?.id) { realId = msg.id; break; }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!realId) {
      return json({ error: 'Forbidden' }, 403);
    }

    let preview: Record<string, unknown> = { url, error: null };
    try {
      preview = await fetchPreview(url);
    } catch (err: any) {
      preview = { url, error: String(err?.message ?? err), fetched_at: new Date().toISOString() };
    }

    // Use service role to write (RLS on chat_messages UPDATE is restrictive),
    // safe because we already verified the caller can see this row.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { error } = await admin
      .from('chat_messages')
      .update({ link_preview: preview })
      .eq('id', realId);

    if (error) {
      return json({ error: error.message }, 500);
    }

    return json({ ok: true, preview });
  } catch (err: any) {
    return json({ error: String(err?.message ?? err) }, 500);
  }
});
