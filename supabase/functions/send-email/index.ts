import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Payload {
  template_slug?: string
  to: string | string[]
  subject?: string
  html?: string
  text?: string
  variables?: Record<string, string>
  company_id?: string
}

const renderVars = (template: string, vars: Record<string, string> = {}) => {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => vars[k] ?? '')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurado')

    const internalKey = req.headers.get('x-internal-key') || ''
    const isInternal = internalKey === SERVICE_KEY
    let userId: string | null = null

    if (!isInternal) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) throw new Error('Não autenticado')
      const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      })
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) throw new Error('Não autenticado')
      userId = user.id
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY)
    const body: Payload = await req.json()

    let subject = body.subject || ''
    let html = body.html || ''
    let text = body.text || ''
    let templateSlug = body.template_slug || null

    if (templateSlug) {
      const { data: tpl, error } = await admin
        .from('email_templates')
        .select('subject, html_body, text_body')
        .eq('slug', templateSlug)
        .eq('is_active', true)
        .is('company_id', null)
        .maybeSingle()
      if (error || !tpl) throw new Error(`Template "${templateSlug}" não encontrado`)
      subject = renderVars(tpl.subject, body.variables)
      html = renderVars(tpl.html_body, body.variables)
      text = tpl.text_body ? renderVars(tpl.text_body, body.variables) : ''
    }

    if (!subject || !html) throw new Error('subject e html são obrigatórios')

    // Get from_email
    const { data: cfg } = await admin
      .from('system_integrations').select('value').eq('key', 'resend').maybeSingle()
    const fromEmail = (cfg?.value as any)?.from_email || 'onboarding@resend.dev'
    const fromName = (cfg?.value as any)?.from_name || 'CRM'

    const recipients = Array.isArray(body.to) ? body.to : [body.to]

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: recipients,
        subject,
        html,
        text: text || undefined,
      }),
    })

    const result = await resp.json()
    const ok = resp.ok

    await admin.from('notification_log').insert({
      channel: 'email',
      template_slug: templateSlug,
      recipient: recipients.join(','),
      subject,
      status: ok ? 'sent' : 'failed',
      error: ok ? null : JSON.stringify(result),
      payload: { variables: body.variables },
      company_id: body.company_id || null,
      sent_by: userId,
    })

    if (!ok) throw new Error(result?.message || 'Falha ao enviar e-mail')

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    console.error('send-email error:', e?.message)
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Erro' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
