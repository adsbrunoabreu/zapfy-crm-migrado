// Bootstrap do vault: popula vault.secrets com supabase_service_role_key e supabase_url
// usando os secrets já injetados nas edge functions. Idempotente.
// Auth: somente Master JWT.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

  // Auth: x-internal-key (= CRON_SECRET ou SERVICE) OU master JWT
  const internalKey = req.headers.get('x-internal-key') || ''
  const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
  const isInternal = internalKey && (internalKey === CRON_SECRET || internalKey === SERVICE_KEY)
  if (!isInternal) {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const adminCheck = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: isMaster } = await adminCheck.rpc('is_master', { _user_id: user.id })
    if (!isMaster) return json({ error: 'Forbidden' }, 403)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // Insere/atualiza no vault via RPC SECURITY DEFINER
  const { data, error } = await admin.rpc('bootstrap_vault_secrets', {
    _service_role_key: SERVICE_KEY,
    _supabase_url: SUPABASE_URL,
  })
  if (error) return json({ success: false, error: error.message }, 500)

  return json({ success: true, result: data })
})

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
