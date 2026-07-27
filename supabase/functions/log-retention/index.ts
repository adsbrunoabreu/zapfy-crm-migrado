// log-retention: roda a função public.run_log_retention() (chamado por cron diário ou Master)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // ── Auth: x-internal-key (cron) OU master JWT ──
  const internalKey = req.headers.get('x-internal-key') || ''
  const CRON_SECRET = Deno.env.get('CRON_SECRET') || ''
  const isInternal = internalKey && (internalKey === CRON_SECRET || internalKey === SERVICE_KEY)
  if (!isInternal) {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)
    const { data: isMaster } = await admin.rpc('is_master', { _user_id: user.id })
    if (!isMaster) return json({ error: 'Forbidden' }, 403)
  }

  try {
    const { data, error } = await admin.rpc('run_log_retention')
    if (error) throw error
    const totals = (data ?? []).reduce(
      (acc: { moved: number; purged: number }, r: { moved: number; purged: number }) => ({
        moved: acc.moved + (r.moved ?? 0), purged: acc.purged + (r.purged ?? 0),
      }), { moved: 0, purged: 0 },
    )
    console.log('[log-retention] totals:', totals, 'rows:', data)
    return json({ ok: true, totals, results: data })
  } catch (e) {
    console.error('log-retention error:', e)
    return json({ error: (e as Error).message }, 500)
  }
})
