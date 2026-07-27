// Server-side conversion dispatcher.
// Sends events to Meta Conversions API and (optionally) Google Ads.
// Internal calls require x-internal-secret == CRON_SECRET.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-internal-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sha256Hex(input: string) {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface DispatchBody {
  event_name: string;
  event_id: string;
  company_id?: string | null;
  user_id?: string | null;
  value?: number;
  currency?: string;
  user_data?: {
    email?: string;
    phone?: string;
    external_id?: string;
    fbp?: string;
    fbc?: string;
    gclid?: string;
    ip?: string;
    user_agent?: string;
    country?: string;
    city?: string;
  };
  custom_data?: Record<string, unknown>;
  source?: 'client' | 'server';
  action_source?: 'website' | 'system_generated' | 'app';
  event_source_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Auth: either internal (x-internal-secret) or a valid JWT
  const internalSecret = req.headers.get('x-internal-secret');
  const isInternal = internalSecret && internalSecret === Deno.env.get('CRON_SECRET');
  if (!isInternal) {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: auth } },
    });
    const { data, error } = await userClient.auth.getClaims(auth.replace('Bearer ', ''));
    if (error || !data?.claims?.sub) return json(401, { error: 'Unauthorized' });
  }

  let body: DispatchBody;
  try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
  if (!body.event_name || !body.event_id) return json(400, { error: 'event_name and event_id required' });

  // Read tracking config
  const { data: cfg } = await admin.from('system_integrations').select('value').eq('key', 'tracking').maybeSingle();
  const tcfg = (cfg?.value as any) || {};
  if (!tcfg.enabled) return json(200, { skipped: 'tracking disabled' });

  const META_TOKEN = Deno.env.get('META_CAPI_ACCESS_TOKEN');
  const META_PIXEL_ID = tcfg.meta_pixel_id || Deno.env.get('META_PIXEL_ID');
  const META_TEST_CODE = tcfg.meta_capi_test_event_code || '';

  const ud = body.user_data || {};
  const ip = ud.ip || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const ua = ud.user_agent || req.headers.get('user-agent') || '';

  const hashedUd: Record<string, string | string[]> = {};
  if (ud.email) hashedUd.em = await sha256Hex(ud.email);
  if (ud.phone) hashedUd.ph = await sha256Hex(ud.phone.replace(/\D/g, ''));
  if (ud.external_id) hashedUd.external_id = await sha256Hex(ud.external_id);
  if (ud.country) hashedUd.country = await sha256Hex(ud.country);
  if (ud.city) hashedUd.ct = await sha256Hex(ud.city);
  if (ud.fbp) hashedUd.fbp = ud.fbp;
  if (ud.fbc) hashedUd.fbc = ud.fbc;
  if (ip) hashedUd.client_ip_address = ip;
  if (ua) hashedUd.client_user_agent = ua;

  const results: Record<string, unknown> = {};

  // Meta CAPI
  if (META_TOKEN && META_PIXEL_ID) {
    try {
      const url = `https://graph.facebook.com/v19.0/${META_PIXEL_ID}/events?access_token=${META_TOKEN}`;
      const payload: Record<string, unknown> = {
        data: [{
          event_name: body.event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: body.event_id,
          action_source: body.action_source || 'website',
          event_source_url: body.event_source_url,
          user_data: hashedUd,
          custom_data: {
            currency: body.currency || 'BRL',
            value: body.value,
            ...(body.custom_data || {}),
          },
        }],
      };
      if (META_TEST_CODE) payload.test_event_code = META_TEST_CODE;
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const txt = await r.text();
      results.meta = { status: r.status, body: txt.slice(0, 500) };
      await admin.from('tracking_events').insert({
        company_id: body.company_id || null,
        user_id: body.user_id || null,
        event_name: body.event_name,
        event_id: body.event_id,
        source: body.source || 'server',
        destination: 'meta_capi',
        status: r.ok ? 'sent' : 'failed',
        payload,
        response: { status: r.status, body: txt.slice(0, 500) },
        error: r.ok ? null : txt.slice(0, 500),
      });
    } catch (e) {
      results.meta = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  // Google Ads Enhanced Conversions (only on Purchase + when configured)
  const GADS_DEV = Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN');
  const GADS_CID = Deno.env.get('GOOGLE_ADS_CUSTOMER_ID');
  const GADS_REFRESH = Deno.env.get('GOOGLE_ADS_REFRESH_TOKEN');
  const GADS_CLIENT_ID = Deno.env.get('GOOGLE_ADS_CLIENT_ID');
  const GADS_CLIENT_SECRET = Deno.env.get('GOOGLE_ADS_CLIENT_SECRET');
  const GADS_CONV_ID = tcfg.google_ads_id?.replace('AW-', '') || Deno.env.get('GOOGLE_ADS_CONVERSION_ID');
  const GADS_LABEL = tcfg.google_ads_conversion_label || Deno.env.get('GOOGLE_ADS_CONVERSION_LABEL');

  if (body.event_name.toLowerCase() === 'purchase' && GADS_DEV && GADS_CID && GADS_REFRESH && GADS_CLIENT_ID && GADS_CLIENT_SECRET && GADS_CONV_ID && GADS_LABEL) {
    try {
      // Refresh token
      const tokRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GADS_CLIENT_ID,
          client_secret: GADS_CLIENT_SECRET,
          refresh_token: GADS_REFRESH,
          grant_type: 'refresh_token',
        }),
      });
      const tokJson = await tokRes.json();
      const accessToken = tokJson.access_token;
      if (!accessToken) throw new Error('No access token from Google');

      const conversionAction = `customers/${GADS_CID}/conversionActions/${GADS_CONV_ID}~${GADS_LABEL}`;
      const click = ud.gclid
        ? { gclid: ud.gclid, conversionAction, conversionDateTime: new Date().toISOString().replace('T', ' ').slice(0, 19) + '+00:00', conversionValue: body.value, currencyCode: body.currency || 'BRL', userIdentifiers: [] as unknown[] }
        : { conversionAction, conversionDateTime: new Date().toISOString().replace('T', ' ').slice(0, 19) + '+00:00', conversionValue: body.value, currencyCode: body.currency || 'BRL', userIdentifiers: [] as unknown[] };
      if (hashedUd.em) (click.userIdentifiers as unknown[]).push({ hashedEmail: hashedUd.em });
      if (hashedUd.ph) (click.userIdentifiers as unknown[]).push({ hashedPhoneNumber: hashedUd.ph });

      const gUrl = `https://googleads.googleapis.com/v17/customers/${GADS_CID}:uploadClickConversions`;
      const gRes = await fetch(gUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'developer-token': GADS_DEV,
        },
        body: JSON.stringify({ conversions: [click], partialFailure: true }),
      });
      const gTxt = await gRes.text();
      results.google_ads = { status: gRes.status, body: gTxt.slice(0, 500) };
      await admin.from('tracking_events').insert({
        company_id: body.company_id || null,
        user_id: body.user_id || null,
        event_name: body.event_name,
        event_id: body.event_id,
        source: body.source || 'server',
        destination: 'google_ads',
        status: gRes.ok ? 'sent' : 'failed',
        payload: click,
        response: { status: gRes.status, body: gTxt.slice(0, 500) },
        error: gRes.ok ? null : gTxt.slice(0, 500),
      });
    } catch (e) {
      results.google_ads = { error: e instanceof Error ? e.message : String(e) };
    }
  }

  return json(200, { ok: true, results });
});
