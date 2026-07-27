/**
 * cloud-coexistence-onboard
 * -------------------------
 * Conclui o onboarding de Coexistência (Cloud API + WhatsApp Business app):
 *  1. Troca o `code` (vindo do Embedded Signup) por um access token.
 *  2. Assina o app no WABA (`/{waba_id}/subscribed_apps`).
 *  3. Lê metadados do número (`is_on_biz_app`, `display_phone_number`).
 *  4. Persiste a instância em `whatsapp_instances` com `mode='coexistence'`.
 *  5. Dispara `POST /{phone_number_id}/smb_app_data`:
 *       - sync_type=smb_app_state_sync (contatos)
 *       - sync_type=history             (mensagens dos últimos 6 meses)
 *  6. Atualiza `coexistence_state` com os request_ids retornados.
 *
 * Auth: JWT do usuário; resolve `company_id` via `profiles`.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const Body = z.object({
  code: z.string().min(10),
  waba_id: z.string().regex(/^\d+$/),
  phone_number_id: z.string().regex(/^\d+$/),
  display_name: z.string().trim().min(2).max(80),
});

function generateVerifyToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.startsWith('Bearer ')) return json({ error: 'unauthorized' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const META_APP_ID = Deno.env.get('META_APP_ID') ?? '';
    const META_APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';
    const GRAPH_VERSION = Deno.env.get('META_GRAPH_VERSION') ?? 'v22.0';
    const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

    if (!META_APP_ID || !META_APP_SECRET) {
      return json({ error: 'meta_not_configured' }, 500);
    }

    const userClient = createClient(url, anon, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'unauthorized' }, 401);

    const adminClient = createClient(url, service);

    const { data: profile } = await adminClient
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile?.company_id) return json({ error: 'no_company' }, 403);

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
      return json({ error: 'invalid_body', details: parsed.error.flatten().fieldErrors }, 400);
    }
    const { code, waba_id, phone_number_id, display_name } = parsed.data;

    // ── 1) Troca code → access_token ───────────────────────────────────────
    const tokenUrl = new URL(`${GRAPH_BASE}/oauth/access_token`);
    tokenUrl.searchParams.set('client_id', META_APP_ID);
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
    tokenUrl.searchParams.set('code', code);
    const tokResp = await fetch(tokenUrl.toString());
    const tokJson = await tokResp.json().catch(() => ({}));
    if (!tokResp.ok || !tokJson?.access_token) {
      console.error('[coex.onboard] token exchange failed', tokJson);
      return json({ error: 'token_exchange_failed', details: tokJson }, 400);
    }
    const accessToken = String(tokJson.access_token);

    // ── 2) Subscribe ao WABA ───────────────────────────────────────────────
    const subResp = await fetch(`${GRAPH_BASE}/${waba_id}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const subJson = await subResp.json().catch(() => ({}));
    if (!subResp.ok) {
      console.error('[coex.onboard] subscribed_apps failed', subJson);
      return json({ error: 'subscribed_apps_failed', details: subJson }, 400);
    }

    // ── 3) Confere is_on_biz_app + display_phone_number ────────────────────
    const metaResp = await fetch(
      `${GRAPH_BASE}/${phone_number_id}?fields=display_phone_number,verified_name,is_on_biz_app,platform_type`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const metaJson = await metaResp.json().catch(() => ({}));
    if (!metaResp.ok) {
      console.error('[coex.onboard] phone meta failed', metaJson);
      return json({ error: 'phone_meta_failed', details: metaJson }, 400);
    }
    const displayPhone = String(metaJson.display_phone_number ?? '').replace(/\D/g, '');
    const verifiedName = metaJson.verified_name ?? null;

    // ── 4) Persiste instância ──────────────────────────────────────────────
    const verifyToken = generateVerifyToken();
    const config = {
      accessToken,
      phoneNumberId: phone_number_id,
      businessAccountId: waba_id,
      webhookVerifyToken: verifyToken,
      verifiedName,
      isOnBizApp: !!metaJson.is_on_biz_app,
      platformType: metaJson.platform_type ?? null,
    };

    const instanceName = `cloud_${phone_number_id}`;
    const { data: inserted, error: insErr } = await adminClient
      .from('whatsapp_instances')
      .upsert(
        [{
          company_id: profile.company_id,
          provider: 'cloud_api',
          mode: 'coexistence',
          instance_name: instanceName,
          display_name,
          phone_number: displayPhone || null,
          status: 'connected',
          is_active: true,
          is_preferred: false,
          config,
          coexistence_state: {
            contacts_status: 'pending',
            history_status: 'pending',
            contacts_imported: 0,
            history_chunks_received: 0,
            history_chunks_processed: 0,
          },
          last_sync: new Date().toISOString(),
          last_error: null,
        }],
        { onConflict: 'company_id,instance_name' },
      )
      .select('id')
      .maybeSingle();

    if (insErr || !inserted) {
      console.error('[coex.onboard] persist failed', insErr);
      return json({ error: 'persist_failed', details: insErr?.message ?? 'no_row' }, 500);
    }
    const instanceId = inserted.id as string;

    // ── 5) Dispara smb_app_data: contatos + histórico ─────────────────────
    async function smbAppData(syncType: 'smb_app_state_sync' | 'history'): Promise<string | null> {
      const r = await fetch(`${GRAPH_BASE}/${phone_number_id}/smb_app_data`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: syncType }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error(`[coex.onboard] smb_app_data ${syncType} failed`, j);
        return null;
      }
      return String(j.request_id ?? '');
    }

    const contactsReq = await smbAppData('smb_app_state_sync');
    const historyReq = await smbAppData('history');

    await adminClient
      .from('whatsapp_instances')
      .update({
        coexistence_state: {
          contacts_status: contactsReq ? 'pending' : 'failed',
          history_status: historyReq ? 'pending' : 'failed',
          contacts_imported: 0,
          history_chunks_received: 0,
          history_chunks_processed: 0,
          last_sync_request_id: historyReq ?? contactsReq ?? null,
          contacts_request_id: contactsReq,
          history_request_id: historyReq,
        },
      })
      .eq('id', instanceId);

    await adminClient.from('message_sync_log').insert({
      company_id: profile.company_id,
      event: 'coex.onboard',
      provider: 'cloud_api',
      status: contactsReq && historyReq ? 'success' : 'warning',
      metadata: {
        instance_id: instanceId,
        waba_id,
        phone_number_id,
        contacts_request_id: contactsReq,
        history_request_id: historyReq,
        is_on_biz_app: !!metaJson.is_on_biz_app,
      },
    });

    return json({
      ok: true,
      instance_id: instanceId,
      contacts_request_id: contactsReq,
      history_request_id: historyReq,
    });
  } catch (e) {
    console.error('[cloud-coexistence-onboard] error:', (e as Error)?.message);
    return json({ error: (e as Error)?.message ?? 'internal_error' }, 500);
  }
});
