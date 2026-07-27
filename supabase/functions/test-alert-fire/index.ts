// Dispara um alerta sintético para validação end-to-end.
// kind=webhook_failure: insere uma linha em webhook_retry_queue com
// attempts = max_attempts - 1 e kind inválido. No próximo tick (até 1min)
// o worker tenta processar, falha e marca como 'dead', criando um
// app_notifications.type='webhook_retry_dead'. A UI usa o test_id retornado
// para detectar a notificação.

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

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // Auth: master JWT obrigatório
  const authHeader = req.headers.get('Authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return json({ error: 'Unauthorized' }, 401)
  const { data: isMaster } = await admin.rpc('is_master', { _user_id: user.id })
  if (!isMaster) return json({ error: 'Forbidden' }, 403)

  let body: any = {}
  try { body = await req.json() } catch { /* */ }
  const kind = (body.kind ?? 'webhook_failure') as string

  if (kind !== 'webhook_failure') {
    return json({ error: `unsupported_kind:${kind}` }, 400)
  }

  try {
    const testId = crypto.randomUUID()
    const messageId = `TEST-${testId.slice(0, 8)}`

    // Pega qualquer company_id para satisfazer NOT NULL (preferimos a do master)
    const { data: anyCompany } = await admin
      .from('companies').select('id').limit(1).maybeSingle()
    const companyId = anyCompany?.id || crypto.randomUUID()

    // Insere falha sintética: kind inválido => processItem retorna unknown_kind
    // attempts = max_attempts - 1 => próxima falha vira 'dead' imediatamente
    const { data: row, error: insErr } = await admin
      .from('webhook_retry_queue')
      .insert({
        company_id: companyId,
        kind: `__alert_test__${testId}`,
        provider: 'test',
        message_id: messageId,
        payload: { test_id: testId, source: 'test-alert-fire' },
        attempts: 4,
        max_attempts: 5,
        next_attempt_at: new Date().toISOString(),
        status: 'pending',
      })
      .select('id')
      .single()
    if (insErr) throw insErr

    // Dispara o worker imediatamente (best effort)
    const triggerStart = Date.now()
    try {
      await fetch(`${SUPABASE_URL}/functions/v1/webhook-retry-worker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: '{}',
      })
    } catch (_) { /* cron pega no próximo tick */ }

    await admin.from('system_logs').insert({
      source: 'alert_test',
      level: 'info',
      event: 'alert_test.fired',
      message: 'Teste de alerta disparado',
      metadata: { test_id: testId, retry_id: row.id, kind, triggered_worker_ms: Date.now() - triggerStart },
    })

    return json({
      success: true,
      test_id: testId,
      retry_id: row.id,
      message_id: messageId,
      fired_at: new Date().toISOString(),
      hint: 'Aguardando notificação webhook_retry_dead com metadata.retry_id == retry_id',
    })
  } catch (e: any) {
    return json({ error: e?.message || 'unknown' }, 500)
  }
})

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
