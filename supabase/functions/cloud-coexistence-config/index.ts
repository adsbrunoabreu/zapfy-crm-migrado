/**
 * cloud-coexistence-config
 * ------------------------
 * Endpoint público (verify_jwt=false implícito) que retorna a configuração
 * **não-secreta** do app Meta para o front-end inicializar o SDK do
 * Facebook e abrir o Embedded Signup com `featureType=whatsapp_business_app_onboarding`.
 *
 * Retorna `{ appId, configId, graphVersion }`.
 *
 * O appId é considerado público (vai para o browser de qualquer forma).
 * O configId também é público (id da configuração de Login no painel da Meta).
 * Não retornamos `META_APP_SECRET` (esse é trocado por token só no servidor).
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const appId = Deno.env.get('META_APP_ID') ?? '';
  const configId = Deno.env.get('META_COEXISTENCE_CONFIG_ID') ?? '';
  const graphVersion = Deno.env.get('META_GRAPH_VERSION') ?? 'v22.0';

  if (!appId || !configId) {
    return json({ error: 'meta_not_configured', appId: null, configId: null }, 200);
  }

  return json({ appId, configId, graphVersion });
});
