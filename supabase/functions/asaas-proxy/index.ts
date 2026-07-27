// Asaas API proxy. Server-side only — never expose ASAAS_API_KEY to the browser.
// Auth: requires JWT (company_admin); operations are scoped to user's company_id.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface ProxyBody {
  action:
    | 'ping'
    | 'createCustomer'
    | 'createSubscription'
    | 'updateSubscription'
    | 'cancelSubscription'
    | 'getSubscription'
    | 'tokenizeCreditCard'
    | 'getPixQrCode'
    | 'listPayments'
    | 'getPayment'
    | 'retryLog';
  payload?: Record<string, unknown>;
  subscription_id?: string; // local DB id
  log_id?: string; // for retryLog
}

function redactPayload(p: any): any {
  if (!p || typeof p !== 'object') return p;
  const clone: any = Array.isArray(p) ? [...p] : { ...p };
  const sensitive = ['ccv', 'cvv', 'securityCode', 'number', 'creditCardNumber', 'creditCardCcv'];
  for (const k of Object.keys(clone)) {
    if (sensitive.includes(k) && typeof clone[k] === 'string') {
      clone[k] = '***';
    } else if (k === 'creditCard' && clone[k] && typeof clone[k] === 'object') {
      clone[k] = { ...clone[k], number: '***', ccv: '***', creditCardNumber: '***' };
    } else if (clone[k] && typeof clone[k] === 'object') {
      clone[k] = redactPayload(clone[k]);
    }
  }
  return clone;
}

async function asaasFetch(env: 'sandbox' | 'live', apiKey: string, path: string, init: RequestInit = {}) {
  const base = env === 'live' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'access_token': apiKey,
      'User-Agent': 'CredFlowCRM/1.0',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!ASAAS_API_KEY) return json(500, { error: 'ASAAS_API_KEY not configured' });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Unauthorized' });

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsErr || !claims?.claims?.sub) return json(401, { error: 'Unauthorized' });
    const userId = claims.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    // Get user company + role
    const { data: profile } = await admin.from('profiles').select('id, company_id, role, email, full_name').eq('id', userId).maybeSingle();
    if (!profile?.company_id) return json(403, { error: 'No company' });

    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', userId).in('role', ['master', 'admin']);
    const roles = (roleRow || []).map((r: any) => r.role);
    const isAdmin = roles.length > 0;
    const isMaster = roles.includes('master');
    if (!isAdmin) return json(403, { error: 'Forbidden' });

    // Read environment from system_integrations
    const { data: cfg } = await admin.from('system_integrations').select('value').eq('key', 'asaas').maybeSingle();
    const env = ((cfg?.value as any)?.environment === 'live' ? 'live' : 'sandbox') as 'live' | 'sandbox';

    const body = (await req.json()) as ProxyBody;
    let { action, payload = {} } = body;
    let retryOf: string | null = null;

    // Resolve retry: load original log and replay action+payload
    if (action === 'retryLog') {
      if (!body.log_id) return json(400, { error: 'log_id required' });
      const { data: orig } = await admin
        .from('asaas_logs')
        .select('id, action, request_payload, company_id, direction')
        .eq('id', body.log_id)
        .maybeSingle();
      if (!orig) return json(404, { error: 'Log não encontrado' });
      if (orig.direction !== 'proxy_request') return json(400, { error: 'Apenas chamadas de saída podem ser reenviadas' });
      if (!isMaster && orig.company_id !== profile.company_id) return json(403, { error: 'Forbidden' });
      action = orig.action as any;
      payload = (orig.request_payload as any) || {};
      retryOf = orig.id;
    }

    // Get client IP for tokenization
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      '127.0.0.1';

    let path = '';
    let init: RequestInit = { method: 'POST', body: JSON.stringify(payload) };

    switch (action) {
      case 'ping': {
        const r = await asaasFetch(env, ASAAS_API_KEY, '/myAccount', { method: 'GET' });
        await admin.from('asaas_logs').insert({
          company_id: profile.company_id,
          direction: 'proxy_request',
          action: 'ping',
          http_status: r.status,
          ok: r.ok,
          environment: env,
          request_payload: {},
          response_payload: r.data as any,
          error_message: r.ok ? null : ((r.data as any)?.errors?.[0]?.description || `HTTP ${r.status}`),
          retry_of: retryOf,
          created_by: userId,
        });
        return json(r.ok ? 200 : 502, { ok: r.ok, environment: env, account: r.data });
      }
      case 'createCustomer': { path = '/customers'; break; }
      case 'createSubscription': { path = '/subscriptions'; break; }
      case 'updateSubscription': {
        const id = payload.id as string;
        path = `/subscriptions/${id}`;
        const { id: _omit, ...rest } = payload as any;
        init = { method: 'PUT', body: JSON.stringify(rest) };
        break;
      }
      case 'cancelSubscription': {
        if (!isMaster) {
          return json(403, { error: 'Subscription cancellation is restricted to platform admins' });
        }
        const id = payload.id as string;
        path = `/subscriptions/${id}`;
        init = { method: 'DELETE' };
        break;
      }
      case 'getSubscription': {
        const id = payload.id as string;
        path = `/subscriptions/${id}`;
        init = { method: 'GET' };
        break;
      }
      case 'tokenizeCreditCard': {
        path = '/creditCard/tokenizeCreditCard';
        init = {
          method: 'POST',
          body: JSON.stringify({ ...payload, remoteIp: clientIp }),
        };
        break;
      }
      case 'getPixQrCode': {
        const id = payload.id as string;
        path = `/payments/${id}/pixQrCode`;
        init = { method: 'GET' };
        break;
      }
      case 'listPayments': {
        const qs = new URLSearchParams(payload as Record<string, string>).toString();
        path = `/payments${qs ? `?${qs}` : ''}`;
        init = { method: 'GET' };
        break;
      }
      case 'getPayment': {
        const id = payload.id as string;
        path = `/payments/${id}`;
        init = { method: 'GET' };
        break;
      }
      default:
        return json(400, { error: 'Unknown action' });
    }

    const r = await asaasFetch(env, ASAAS_API_KEY, path, init);

    // Persist log (redact card data)
    const safePayload = action === 'tokenizeCreditCard' || action === 'createSubscription'
      ? redactPayload(payload)
      : payload;
    await admin.from('asaas_logs').insert({
      company_id: profile.company_id,
      direction: 'proxy_request',
      action,
      http_status: r.status,
      ok: r.ok,
      environment: env,
      request_payload: safePayload as any,
      response_payload: r.data as any,
      error_message: r.ok ? null : ((r.data as any)?.errors?.[0]?.description || (r.data as any)?.error || `HTTP ${r.status}`),
      asaas_payment_id: (r.data as any)?.id || null,
      retry_of: retryOf,
      created_by: userId,
    });

    // If subscription creation failed because the stored customer is invalid in the
    // current Asaas environment (e.g. customer was created in sandbox and we are now
    // running in live), clear it so the client can recreate the customer and retry.
    if (!r.ok && action === 'createSubscription') {
      const errCode = (r.data as any)?.errors?.[0]?.code;
      if (errCode === 'invalid_customer') {
        try {
          await admin
            .from('companies')
            .update({ asaas_customer_id: null })
            .eq('id', profile.company_id);
        } catch (_) {}
      }
    }

    // After certain successful operations, persist what we know
    if (r.ok) {
      if (action === 'createCustomer' && (r.data as any)?.id) {
        const customerId = (r.data as any).id as string;
        await admin.from('companies').update({ asaas_customer_id: customerId }).eq('id', profile.company_id);
      }
      if (action === 'createSubscription' && (r.data as any)?.id) {
        const subData: any = r.data;
        const last4 = subData.creditCard?.creditCardNumber || subData.creditCard?.last4 || null;
        const brand = subData.creditCard?.creditCardBrand || null;
        const method = (subData.billingType || (payload as any).billingType || '').toUpperCase();
        const { data: localSub } = await admin
          .from('subscriptions')
          .select('id')
          .eq('company_id', profile.company_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (localSub?.id) {
          await admin
            .from('subscriptions')
            .update({
              asaas_subscription_id: subData.id,
              asaas_customer_id: subData.customer || (payload as any).customer || null,
              payment_method: method || null,
              card_last4: last4 ? String(last4).slice(-4) : null,
              card_brand: brand,
              next_due_date: subData.nextDueDate || null,
            })
            .eq('id', localSub.id);
        }
      }
    }

    return json(r.ok ? 200 : r.status, r.data);
  } catch (e) {
    console.error('asaas-proxy error', e);
    return json(500, { error: e instanceof Error ? e.message : 'Internal error' });
  }
});
