// Cron-driven processor: dispatches due rows from public.scheduled_messages
// via Evolution API (sendText / sendMedia). Marks each row sent/failed.
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
const EVOLUTION_KEY = Deno.env.get('EVOLUTION_API_KEY') || Deno.env.get('EVOLUTION_MASTER_API_KEY') || ''

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

const sendMedia = async (
  instance: string,
  number: string,
  mediaUrl: string,
  mimetype: string,
  fileName: string,
  caption: string,
) => {
  const mediatype = mimetype.startsWith('image/') ? 'image'
    : mimetype.startsWith('video/') ? 'video'
    : mimetype.startsWith('audio/') ? 'audio' : 'document'
  const r = await fetch(`${EVOLUTION_URL}/message/sendMedia/${instance}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: EVOLUTION_KEY },
    body: JSON.stringify({ number, mediatype, mimetype, caption, media: mediaUrl, fileName }),
  })
  if (!r.ok) throw new Error(`sendMedia ${r.status}: ${await r.text()}`)
  return await r.json()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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

  // Pull a small batch of due messages
  const { data: due, error } = await admin
    .from('scheduled_messages')
    .select('id, company_id, lead_id, message, message_type, media_url, media_mimetype, media_filename, media_caption')
    .eq('status', 'pending')
    .lte('send_at', new Date().toISOString())
    .order('send_at', { ascending: true })
    .limit(25)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let sent = 0, failed = 0
  for (const row of due ?? []) {
    try {
      // Lookup lead phone + active instance
      const { data: lead } = await admin
        .from('leads').select('phone, name').eq('id', row.lead_id).maybeSingle()
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

      if (row.message_type === 'media' && row.media_url) {
        await sendMedia(inst.instance_name, phone, row.media_url,
          row.media_mimetype || 'application/octet-stream',
          row.media_filename || 'arquivo',
          row.media_caption || row.message || '')
      } else {
        await sendText(inst.instance_name, phone, row.message || '')
      }

      await admin.from('scheduled_messages').update({
        status: 'sent', sent_at: new Date().toISOString(), error_message: null,
      }).eq('id', row.id)
      sent++
    } catch (e) {
      await admin.from('scheduled_messages').update({
        status: 'failed', error_message: String((e as Error).message).slice(0, 500),
      }).eq('id', row.id)
      failed++
    }
  }

  return new Response(JSON.stringify({ processed: due?.length ?? 0, sent, failed }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
