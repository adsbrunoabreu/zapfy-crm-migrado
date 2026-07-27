// Worker: dispatches due rows from public.appointment_reminders.
// Kinds:
//   - client_reminder (channel=whatsapp): envia texto via Evolution API.
//   - feedback_email                  : envia e-mail via send-email function.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-internal-key',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const EVOLUTION_URL = (Deno.env.get('EVOLUTION_API_URL') || '').replace(/\/+$/, '')
const EVOLUTION_KEY =
  Deno.env.get('EVOLUTION_API_KEY') || Deno.env.get('EVOLUTION_MASTER_API_KEY') || ''

const onlyDigits = (s: string) => String(s || '').replace(/\D+/g, '')

const sendText = async (instance: string, number: string, text: string) => {
  const r = await fetch(`${EVOLUTION_URL}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
    body: JSON.stringify({ number, text, delay: 1200, linkPreview: true }),
  })
  if (!r.ok) throw new Error(`sendText ${r.status}: ${await r.text()}`)
  return await r.json()
}

const fmtDateTime = (iso: string, tz = 'America/Sao_Paulo') => {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: tz,
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  // Auth: x-internal-key (cron) ou master JWT
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

  const { data: due, error } = await admin
    .from('appointment_reminders')
    .select('id, appointment_id, company_id, kind, channel, payload, attempts')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(25)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let sent = 0, failed = 0
  for (const row of due ?? []) {
    try {
      const { data: appt } = await admin
        .from('appointments')
        .select('id, lead_id, start_at, end_at, timezone, title, status, cancel_reason, professional_id, company_id, reason_id')
        .eq('id', row.appointment_id)
        .maybeSingle()
      if (!appt) throw new Error('agendamento removido')
      // Não envia para status terminais (exceto feedback_email no cancelamento)
      if (row.kind === 'client_reminder' && !['scheduled', 'confirmed'].includes(appt.status)) {
        await admin.from('appointment_reminders').update({
          status: 'cancelled', updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        continue
      }

      const { data: lead } = appt.lead_id
        ? await admin.from('leads').select('phone, name, email').eq('id', appt.lead_id).maybeSingle()
        : { data: null as any }

      const { data: reason } = appt.reason_id
        ? await admin.from('appointment_reasons').select('name').eq('id', appt.reason_id).maybeSingle()
        : { data: null as any }
      const { data: company } = await admin
        .from('companies').select('name').eq('id', row.company_id).maybeSingle()

      const when = fmtDateTime(appt.start_at, appt.timezone || 'America/Sao_Paulo')
      const subject_label = appt.title || reason?.name || 'compromisso'
      const company_name = company?.name || ''

      if (row.kind === 'client_reminder') {
        const phone = onlyDigits(lead?.phone || '')
        if (!phone) throw new Error('lead sem telefone')

        const { data: inst } = await admin
          .from('whatsapp_instances')
          .select('instance_name, status')
          .eq('company_id', row.company_id)
          .eq('status', 'connected')
          .order('updated_at', { ascending: false })
          .limit(1).maybeSingle()
        if (!inst?.instance_name) throw new Error('nenhuma instância conectada')

        const text =
          `Olá${lead?.name ? `, ${lead.name}` : ''}! ` +
          `Lembrando do seu ${subject_label} em ${when}.` +
          (company_name ? `\n\n— ${company_name}` : '')
        await sendText(inst.instance_name, phone, text)
      } else if (row.kind === 'feedback_email') {
        const to = lead?.email
        if (!to) throw new Error('lead sem e-mail')
        const reasonTxt = appt.cancel_reason ? `\n\nMotivo informado: ${appt.cancel_reason}` : ''
        const html = `
          <p>Olá${lead?.name ? `, <b>${lead.name}</b>` : ''},</p>
          <p>Seu agendamento <b>${subject_label}</b> previsto para <b>${when}</b> foi cancelado.</p>
          <p>Sentimos muito! Gostaríamos de saber o motivo para melhorar nosso atendimento.
          Basta responder este e-mail com seu feedback.</p>
          ${appt.cancel_reason ? `<p><i>Motivo registrado: ${appt.cancel_reason}</i></p>` : ''}
          ${company_name ? `<p>— ${company_name}</p>` : ''}
        `
        const text = `Seu agendamento ${subject_label} em ${when} foi cancelado. ` +
          `Conte-nos o motivo respondendo este e-mail.${reasonTxt}`
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': SERVICE_KEY,
          },
          body: JSON.stringify({
            to, subject: `Seu agendamento foi cancelado`, html, text,
            company_id: row.company_id,
          }),
        })
        if (!r.ok) throw new Error(`send-email ${r.status}: ${await r.text()}`)
      } else {
        throw new Error(`kind não suportado: ${row.kind}`)
      }

      await admin.from('appointment_reminders').update({
        status: 'sent', sent_at: new Date().toISOString(), error: null,
        attempts: (row.attempts || 0) + 1, updated_at: new Date().toISOString(),
      }).eq('id', row.id)
      sent++
    } catch (e) {
      const attempts = (row.attempts || 0) + 1
      const isFinal = attempts >= 5
      await admin.from('appointment_reminders').update({
        status: isFinal ? 'failed' : 'pending',
        attempts,
        error: String((e as Error).message).slice(0, 500),
        updated_at: new Date().toISOString(),
        scheduled_for: isFinal
          ? new Date().toISOString()
          : new Date(Date.now() + Math.min(60 * Math.pow(2, attempts), 1800) * 1000).toISOString(),
      }).eq('id', row.id)
      failed++
    }
  }

  return new Response(JSON.stringify({ processed: due?.length ?? 0, sent, failed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
