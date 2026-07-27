// Cron-driven processor: advances active sequence enrollments.
// For each due enrollment: render template, insert into scheduled_messages,
// then either schedule next step or mark completed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

interface StepRow {
  id: string
  position: number
  template_id: string | null
  body_override: string | null
  delay_minutes: number
  media_url: string | null
  media_mimetype: string | null
  media_filename: string | null
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

  const now = new Date()

  const { data: due, error } = await admin
    .from('message_sequence_enrollments')
    .select('id, company_id, sequence_id, lead_id, current_step')
    .eq('status', 'active')
    .lte('next_run_at', now.toISOString())
    .limit(50)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let processed = 0, completed = 0, scheduled = 0, errors = 0

  for (const e of due ?? []) {
    try {
      // Load sequence config (business_hours_only)
      const { data: seq } = await admin
        .from('message_sequences')
        .select('business_hours_only, is_active')
        .eq('id', e.sequence_id).maybeSingle()
      if (!seq?.is_active) {
        await admin.from('message_sequence_enrollments').update({
          status: 'canceled', cancel_reason: 'sequence_inactive', completed_at: now.toISOString(),
        }).eq('id', e.id); continue
      }

      // Off-hours: defer 30min if business_hours_only
      if (seq.business_hours_only) {
        const { data: off } = await admin.rpc('is_off_business_hours', { _company_id: e.company_id })
        if (off === true) {
          const next = new Date(now.getTime() + 30 * 60 * 1000)
          await admin.from('message_sequence_enrollments').update({
            next_run_at: next.toISOString(),
          }).eq('id', e.id)
          continue
        }
      }

      // Load current step
      const { data: steps } = await admin
        .from('message_sequence_steps')
        .select('id, position, template_id, body_override, delay_minutes, media_url, media_mimetype, media_filename')
        .eq('sequence_id', e.sequence_id)
        .order('position', { ascending: true })

      const ordered = (steps ?? []) as StepRow[]
      const step = ordered[e.current_step]
      if (!step) {
        await admin.from('message_sequence_enrollments').update({
          status: 'completed', completed_at: now.toISOString(),
        }).eq('id', e.id)
        completed++; continue
      }

      // Resolve body via template or override
      let body = step.body_override || ''
      let mediaUrl = step.media_url, mediaMime = step.media_mimetype, mediaName = step.media_filename
      if (!body && step.template_id) {
        const { data: tpl } = await admin
          .from('message_templates')
          .select('body, media_url, media_mimetype, media_filename')
          .eq('id', step.template_id).maybeSingle()
        if (tpl) {
          body = tpl.body || ''
          mediaUrl = mediaUrl || tpl.media_url
          mediaMime = mediaMime || tpl.media_mimetype
          mediaName = mediaName || tpl.media_filename
        }
      }

      // Render placeholders
      const { data: rendered } = await admin.rpc('render_template', {
        _body: body, _lead_id: e.lead_id,
      })
      const finalText = (rendered as string) ?? body

      // Enqueue into scheduled_messages (immediate send_at)
      const isMedia = !!mediaUrl
      const { error: insErr } = await admin.from('scheduled_messages').insert({
        company_id: e.company_id,
        lead_id: e.lead_id,
        message: finalText,
        send_at: now.toISOString(),
        status: 'pending',
        message_type: isMedia ? 'media' : 'text',
        media_url: mediaUrl,
        media_mimetype: mediaMime,
        media_filename: mediaName,
        media_caption: isMedia ? finalText : null,
      })
      if (insErr) throw insErr

      // Advance enrollment
      const nextStep = ordered[e.current_step + 1]
      if (!nextStep) {
        await admin.from('message_sequence_enrollments').update({
          current_step: e.current_step + 1,
          status: 'completed', completed_at: now.toISOString(), next_run_at: null,
        }).eq('id', e.id)
        completed++
      } else {
        const next = new Date(now.getTime() + (nextStep.delay_minutes ?? 0) * 60 * 1000)
        await admin.from('message_sequence_enrollments').update({
          current_step: e.current_step + 1,
          next_run_at: next.toISOString(),
        }).eq('id', e.id)
        scheduled++
      }
      processed++
    } catch (err) {
      errors++
      console.error('enrollment failed', e.id, err)
    }
  }

  return new Response(JSON.stringify({ processed, completed, scheduled, errors, total: due?.length ?? 0 }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
