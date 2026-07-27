// Cron processor — chamado a cada 1 minuto
// 1. Drena fila attendance_auto_message_queue → envia via attendance-auto-reply
// 2. Verifica alertas de supervisor → envia e-mail via send-email
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
}

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
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: isMaster } = await admin.rpc('is_master', { _user_id: user.id })
    if (!isMaster) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const result = { auto_replies: 0, supervisor_alerts: 0, errors: [] as string[] }

  try {
    // ---- 1. Auto-replies queue ----
    const { data: queue } = await admin
      .from('attendance_auto_message_queue')
      .select('id, conversation_id, message_kind, attempts')
      .eq('status', 'pending')
      .lt('attempts', 3)
      .order('created_at', { ascending: true })
      .limit(50)

    for (const item of queue || []) {
      // marca processing
      await admin
        .from('attendance_auto_message_queue')
        .update({ status: 'processing', attempts: (item.attempts || 0) + 1 })
        .eq('id', item.id)

      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/attendance-auto-reply`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': SERVICE_KEY,
          },
          body: JSON.stringify({
            conversation_id: item.conversation_id,
            kind: item.message_kind,
            origin: 'edge_function:process-attendance-queue',
            queue_id: item.id,
          }),
        })
        const ok = resp.ok
        const body = await resp.json().catch(() => ({}))
        const skipped = ok && body?.skipped
        await admin
          .from('attendance_auto_message_queue')
          .update({
            status: ok ? 'done' : (item.attempts >= 2 ? 'failed' : 'pending'),
            processed_at: new Date().toISOString(),
            last_error: ok ? (skipped ? String(body.skipped).slice(0, 500) : null) : JSON.stringify(body).slice(0, 500),
          })
          .eq('id', item.id)
        if (ok) result.auto_replies++
      } catch (e: any) {
        await admin
          .from('attendance_auto_message_queue')
          .update({
            status: item.attempts >= 2 ? 'failed' : 'pending',
            last_error: String(e?.message || e).slice(0, 500),
          })
          .eq('id', item.id)
        result.errors.push(`auto-reply ${item.id}: ${e?.message}`)
      }
    }

    // ---- 2. Supervisor alerts ----
    const { data: alerts } = await admin.rpc('get_pending_supervisor_alerts')

    for (const a of alerts || []) {
      try {
        // Buscar admins da empresa
        const { data: admins } = await admin
          .from('profiles')
          .select('email, full_name')
          .eq('company_id', a.company_id)
          .in('role', ['master', 'admin'])
          .eq('is_active', true)
          .limit(20)

        const recipients = (admins || []).map((p) => p.email).filter(Boolean)
        if (recipients.length === 0) continue

        const subject = `⚠️ Atendimento sem resposta há ${a.minutes_silent} min — ${a.ticket_code}`
        const html = `
          <h2>Alerta de atendimento</h2>
          <p>O ticket <strong>${a.ticket_code}</strong> está há <strong>${a.minutes_silent} minutos</strong> sem resposta do agente.</p>
          <ul>
            <li><strong>Cliente:</strong> ${a.contact_name || a.contact_phone || '-'}</li>
            <li><strong>Telefone:</strong> ${a.contact_phone || '-'}</li>
            <li><strong>Atendente:</strong> ${a.assigned_name || 'Não atribuído'}</li>
            <li><strong>Limite configurado:</strong> ${a.threshold_minutes} min</li>
          </ul>
          <p>Acesse o painel para tomar as devidas providências.</p>
        `

        for (const to of recipients) {
          await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-key': SERVICE_KEY,
            },
            body: JSON.stringify({ to, subject, html, internal: true }),
          }).catch((e) => result.errors.push(`email ${to}: ${e?.message}`))
        }

        // Registra alerta
        await admin.from('ticket_supervisor_alerts').insert({
          company_id: a.company_id,
          ticket_id: a.ticket_id,
          minutes_silent: a.minutes_silent,
          recipients_count: recipients.length,
        })

        result.supervisor_alerts++
      } catch (e: any) {
        result.errors.push(`alert ${a.ticket_id}: ${e?.message}`)
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('process-attendance-queue error', e)
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
