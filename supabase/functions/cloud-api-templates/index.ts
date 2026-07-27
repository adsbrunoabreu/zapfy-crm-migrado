/**
 * cloud-api-templates
 * --------------------
 * Edge function para sincronizar e enviar templates HSM (oficiais) da
 * WhatsApp Cloud API.
 *
 * Ações (POST JSON `{ action, instanceId, ... }`):
 *  - `sync`  → busca todos os templates do WABA da instância e faz upsert
 *              em `whatsapp_hsm_templates`.
 *  - `send`  → envia um template aprovado para uma conversa específica.
 *
 * Segurança:
 *  - JWT obrigatório (auth.getClaims).
 *  - Garante que o usuário pertence à mesma `company_id` da instância
 *    (multi-tenant strict isolation).
 *  - Bloqueado quando a empresa estiver com plano inativo.
 */
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { z } from 'https://esm.sh/zod@3.23.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';

const BodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync'), instanceId: z.string().uuid() }),
  z.object({
    action: z.literal('send'),
    instanceId: z.string().uuid(),
    conversationId: z.string().uuid(),
    templateName: z.string().min(1),
    language: z.string().min(2).max(10),
    bodyVariables: z.array(z.string()).optional().default([]),
    headerVariables: z.array(z.string()).optional().default([]),
  }),
]);

interface InstanceRow {
  id: string;
  company_id: string;
  provider: string;
  config: Record<string, unknown>;
  is_active: boolean;
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResp({ error: 'unauthorized' }, 401);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return jsonResp({ error: 'unauthorized' }, 401);
    const userId = userData.user.id;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonResp({ error: 'bad_request', details: parsed.error.flatten() }, 400);
    }
    const payload = parsed.data;

    // service-role para escrever
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);

    // valida instância e tenancy
    const { data: instance, error: instErr } = await svc
      .from('whatsapp_instances')
      .select('id, company_id, provider, config, is_active')
      .eq('id', payload.instanceId)
      .maybeSingle<InstanceRow>();

    if (instErr || !instance) return jsonResp({ error: 'instance_not_found' }, 404);
    if (instance.provider !== 'cloud_api') {
      return jsonResp({ error: 'not_cloud_api_instance' }, 400);
    }

    // tenant check
    const { data: profile } = await svc
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .maybeSingle();
    if (!profile || profile.company_id !== instance.company_id) {
      return jsonResp({ error: 'forbidden' }, 403);
    }

    // plano ativo
    const { data: active } = await svc.rpc('is_company_active', {
      _company_id: instance.company_id,
    });
    if (active === false) return jsonResp({ error: 'plan_inactive' }, 402);

    const cfg = instance.config as Record<string, string>;
    const accessToken = cfg.accessToken;
    const phoneNumberId = cfg.phoneNumberId;
    const wabaId = cfg.businessAccountId;

    if (!accessToken || !phoneNumberId || !wabaId) {
      return jsonResp({ error: 'instance_misconfigured' }, 400);
    }

    if (payload.action === 'sync') {
      const result = await syncTemplates(svc, instance, accessToken, wabaId);
      return jsonResp(result);
    }

    return await sendTemplate(svc, instance, accessToken, phoneNumberId, payload);
  } catch (err) {
    console.error('[cloud-api-templates] error', err);
    return jsonResp({ error: 'internal_error', message: (err as Error)?.message }, 500);
  }
});

async function syncTemplates(
  svc: ReturnType<typeof createClient>,
  instance: InstanceRow,
  accessToken: string,
  wabaId: string,
) {
  const all: any[] = [];
  let url: string | null =
    `${GRAPH_API_BASE}/${encodeURIComponent(wabaId)}/message_templates?limit=200&fields=id,name,language,category,status,components`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const json = await res.json();
    if (!res.ok) {
      console.error('[sync] graph error', json);
      return { error: 'graph_api_error', details: json };
    }
    if (Array.isArray(json.data)) all.push(...json.data);
    url = json?.paging?.next ?? null;
  }

  if (all.length === 0) {
    return { synced: 0, total: 0 };
  }

  const rows = all.map((t) => ({
    company_id: instance.company_id,
    instance_id: instance.id,
    meta_template_id: t.id ?? null,
    name: t.name,
    language: t.language,
    category: t.category ?? 'UTILITY',
    status: t.status ?? 'UNKNOWN',
    components: t.components ?? [],
    last_synced_at: new Date().toISOString(),
  }));

  const { error } = await svc
    .from('whatsapp_hsm_templates')
    .upsert(rows, { onConflict: 'instance_id,name,language' });

  if (error) {
    console.error('[sync] upsert error', error);
    return { error: 'upsert_failed', details: error.message };
  }

  // remove templates que não vieram mais (deletados na Meta)
  const namesLangs = rows.map((r) => `${r.name}::${r.language}`);
  const { data: existing } = await svc
    .from('whatsapp_hsm_templates')
    .select('id, name, language')
    .eq('instance_id', instance.id);
  const toDelete = (existing ?? [])
    .filter((e: any) => !namesLangs.includes(`${e.name}::${e.language}`))
    .map((e: any) => e.id);
  if (toDelete.length > 0) {
    await svc.from('whatsapp_hsm_templates').delete().in('id', toDelete);
  }

  return { synced: rows.length, removed: toDelete.length };
}

async function sendTemplate(
  svc: ReturnType<typeof createClient>,
  instance: InstanceRow,
  accessToken: string,
  phoneNumberId: string,
  payload: Extract<z.infer<typeof BodySchema>, { action: 'send' }>,
) {
  // Busca conversa para obter telefone
  const { data: conv, error: convErr } = await svc
    .from('conversations')
    .select('id, company_id, phone, remote_jid, instance_id')
    .eq('id', payload.conversationId)
    .maybeSingle();

  if (convErr || !conv) return jsonResp({ error: 'conversation_not_found' }, 404);
  if (conv.company_id !== instance.company_id) {
    return jsonResp({ error: 'forbidden_conversation' }, 403);
  }

  const recipient = (conv.phone || conv.remote_jid || '').replace(/\D/g, '');
  if (!recipient) return jsonResp({ error: 'invalid_recipient' }, 400);

  // Monta components
  const components: any[] = [];
  if (payload.headerVariables.length > 0) {
    components.push({
      type: 'header',
      parameters: payload.headerVariables.map((v) => ({ type: 'text', text: v })),
    });
  }
  if (payload.bodyVariables.length > 0) {
    components.push({
      type: 'body',
      parameters: payload.bodyVariables.map((v) => ({ type: 'text', text: v })),
    });
  }

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: recipient,
    type: 'template',
    template: {
      name: payload.templateName,
      language: { code: payload.language },
      ...(components.length > 0 ? { components } : {}),
    },
  };

  const res = await fetch(
    `${GRAPH_API_BASE}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json();

  if (!res.ok) {
    console.error('[send] graph error', data);
    return jsonResp({ error: 'graph_api_error', details: data }, 502);
  }

  const messageId = data?.messages?.[0]?.id ?? null;
  const nowIso = new Date().toISOString();

  // Renderiza o conteúdo final substituindo {{N}} pelos valores enviados,
  // para que a mensagem persistida fique igual à entregue ao lead.
  const renderedContent = renderTemplateContent(
    svc,
    instance,
    payload,
  );
  const finalContent = (await renderedContent) ?? `[${payload.templateName}]`;

  // Persiste em chat_messages
  if (messageId) {
    await svc.from('chat_messages').insert({
      company_id: instance.company_id,
      conversation_id: conv.id,
      remote_jid: conv.remote_jid,
      message_id: messageId,
      from_me: true,
      message_type: 'text',
      content: finalContent,
      status: 'sent',
      timestamp: nowIso,
    });
  }

  return jsonResp({ ok: true, messageId });
}

/**
 * Substitui {{1}}, {{2}}… pelos valores informados em uma string.
 */
function fillVariables(text: string, vars: string[]): string {
  return text.replace(/\{\{(\d+)\}\}/g, (_, idx) => {
    const i = Number(idx) - 1;
    return vars[i] ?? '';
  });
}

/**
 * Reconstrói o conteúdo legível do template HSM (header text + body),
 * com as variáveis já substituídas. Devolve `null` se não conseguir
 * reconstruir (template só de mídia, por exemplo).
 */
async function renderTemplateContent(
  svc: ReturnType<typeof createClient>,
  instance: InstanceRow,
  payload: Extract<z.infer<typeof BodySchema>, { action: 'send' }>,
): Promise<string | null> {
  const { data: tpl } = await svc
    .from('whatsapp_hsm_templates')
    .select('components')
    .eq('instance_id', instance.id)
    .eq('name', payload.templateName)
    .eq('language', payload.language)
    .maybeSingle();

  const components = (tpl?.components as Array<Record<string, unknown>> | null) ?? [];
  if (!components.length) return null;

  const parts: string[] = [];
  for (const c of components) {
    const type = String(c.type ?? '').toUpperCase();
    if (type === 'HEADER' && c.format === 'TEXT' && typeof c.text === 'string') {
      parts.push(fillVariables(c.text, payload.headerVariables));
    } else if (type === 'BODY' && typeof c.text === 'string') {
      parts.push(fillVariables(c.text, payload.bodyVariables));
    } else if (type === 'FOOTER' && typeof c.text === 'string') {
      parts.push(c.text);
    }
  }
  const out = parts.filter(Boolean).join('\n\n').trim();
  return out || null;
}
