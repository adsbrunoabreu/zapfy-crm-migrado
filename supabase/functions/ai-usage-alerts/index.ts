// Cron diário (chamado horariamente, processa 1x/dia por empresa) que verifica
// consumo do add-on Agente IA e dispara alertas em 80% e 100% do limite incluso.
// Idempotência via companies.ai_usage_alert_80_sent_at / _100_sent_at por mês.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)

  const results: any[] = []

  try {
    // Mês atual
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    // Empresas com add-on ativo
    const { data: addons } = await admin.from('company_addons')
      .select('company_id, monthly_price, included_messages')
      .eq('is_active', true).eq('addon_slug', 'ai_agent')

    await admin.from('system_logs').insert({
      source: 'ai_usage_alerts',
      level: 'info',
      event: 'ai_usage_alerts.tick',
      message: `Verificando ${(addons ?? []).length} empresas com Agente IA`,
      metadata: { companies: (addons ?? []).length },
    })

    for (const a of addons || []) {
      try {
        const { data: company } = await admin.from('companies')
          .select('id, name, ai_usage_alert_80_sent_at, ai_usage_alert_100_sent_at')
          .eq('id', a.company_id).maybeSingle()
        if (!company) continue

        const sent80 = company.ai_usage_alert_80_sent_at && company.ai_usage_alert_80_sent_at >= monthStart
        const sent100 = company.ai_usage_alert_100_sent_at && company.ai_usage_alert_100_sent_at >= monthStart
        if (sent80 && sent100) continue

        const { data: usage } = await admin.rpc('get_ai_addon_usage', {
          _company_id: a.company_id,
          _period_start: monthStart,
          _period_end: now.toISOString(),
        })
        const u = usage as any
        const consumed = Number(u?.messages_consumed || 0)
        const included = Number(a.included_messages || 0)
        if (included <= 0) continue
        const pct = consumed / included

        let kind: '80' | '100' | null = null
        if (pct >= 1 && !sent100) kind = '100'
        else if (pct >= 0.8 && !sent80) kind = '80'
        if (!kind) continue

        // Destinatários: admins da empresa
        const { data: admins } = await admin.from('profiles')
          .select('email, full_name').eq('company_id', a.company_id)
          .in('role', ['admin', 'master']).eq('is_active', true)
        const recipients = (admins || []).map((p) => p.email).filter(Boolean) as string[]
        if (recipients.length === 0) continue

        const subject = kind === '100'
          ? `⚠️ Limite do Agente IA atingido (${consumed}/${included} msgs)`
          : `⚠️ Agente IA em ${Math.round(pct * 100)}% do limite mensal`

        const overage = Math.max(0, consumed - included)
        const overageBrl = Number(u?.overage_cost_brl || 0)

        const html = `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
            <h2 style="color:${kind === '100' ? '#dc2626' : '#d97706'};margin:0 0 12px">
              ${kind === '100' ? 'Limite atingido' : 'Atenção: uso elevado'}
            </h2>
            <p>Empresa: <strong>${company.name}</strong></p>
            <p>O Agente IA processou <strong>${consumed.toLocaleString('pt-BR')}</strong>
            de <strong>${included.toLocaleString('pt-BR')}</strong> mensagens incluídas neste mês
            (<strong>${Math.round(pct * 100)}%</strong>).</p>
            ${kind === '100' ? `
              <p>As próximas mensagens serão cobradas como excedente.<br/>
              Excedente atual: <strong>${overage.toLocaleString('pt-BR')} msgs</strong>
              (${overageBrl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
              que serão somados na próxima fatura.</p>
            ` : `
              <p>Você está se aproximando do limite. Avalie o uso para evitar surpresas na fatura.</p>
            `}
            <p style="margin-top:24px;font-size:12px;color:#6b7280">
              Você está recebendo este e-mail como administrador da empresa.
            </p>
          </div>
        `.trim()

        // Envia via send-email
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': SERVICE_KEY,
          },
          body: JSON.stringify({
            to: recipients, subject, html, company_id: a.company_id,
          }),
        })

        const ok = r.ok
        const updField = kind === '100'
          ? { ai_usage_alert_100_sent_at: now.toISOString() }
          : { ai_usage_alert_80_sent_at: now.toISOString() }
        if (ok) {
          await admin.from('companies').update(updField).eq('id', a.company_id)
        }

        results.push({
          company_id: a.company_id, kind, consumed, included, pct: Math.round(pct * 100),
          sent: ok, recipients: recipients.length,
        })
      } catch (e: any) {
        results.push({ company_id: a.company_id, error: e?.message })
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'erro' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
