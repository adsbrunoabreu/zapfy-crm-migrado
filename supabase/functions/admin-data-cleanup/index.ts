import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Validate JWT using getUser (more reliable than getClaims for email)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(JSON.stringify({ error: 'Token inválido' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const userId = user.id
    const userEmail = user.email!

    // Check if user is company_admin or master (using same admin client)

    // Check if user is company_admin or master
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'master'])

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: 'Acesso negado. Apenas administradores podem executar esta ação.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { action, password } = await req.json()

    if (!action || !password) {
      return new Response(JSON.stringify({ error: 'Ação e senha são obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (!['clear_leads'].includes(action)) {
      return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Rate limiting: max 5 password attempts per 15 minutes per user
    const MAX_ATTEMPTS = 5
    const LOCK_MINUTES = 15
    const { data: attemptRow } = await supabaseAdmin
      .from('admin_action_attempts')
      .select('attempts, locked_until')
      .eq('user_id', userId)
      .eq('action', 'cleanup')
      .maybeSingle()

    if (attemptRow?.locked_until && new Date(attemptRow.locked_until) > new Date()) {
      return new Response(
        JSON.stringify({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate password using a separate anon client (not service role)
    const supabasePasswordCheck = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: signInError } = await supabasePasswordCheck.auth.signInWithPassword({
      email: userEmail,
      password,
    })

    if (signInError) {
      const newAttempts = (attemptRow?.attempts ?? 0) + 1
      const lockedUntil = newAttempts >= MAX_ATTEMPTS
        ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
        : null
      await supabaseAdmin.from('admin_action_attempts').upsert({
        user_id: userId,
        action: 'cleanup',
        attempts: newAttempts,
        locked_until: lockedUntil,
        updated_at: new Date().toISOString(),
      })
      return new Response(JSON.stringify({ error: 'Senha incorreta' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Reset attempts on success
    await supabaseAdmin.from('admin_action_attempts').upsert({
      user_id: userId,
      action: 'cleanup',
      attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })

    // Get user's company_id
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('id', userId)
      .single()

    if (!profile?.company_id) {
      return new Response(JSON.stringify({ error: 'Usuário sem empresa vinculada' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const companyId = profile.company_id
    const results: Record<string, number> = {}

    if (action === 'clear_leads') {
      // Delete in order respecting foreign keys
      const { count: activitiesCount } = await supabaseAdmin
        .from('lead_activities')
        .delete({ count: 'exact' })
        .eq('company_id', companyId)
      results.lead_activities = activitiesCount || 0

      // lead_tags via leads
      const { data: leadIds } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('company_id', companyId)

      if (leadIds && leadIds.length > 0) {
        const ids = leadIds.map(l => l.id)
        const { count: tagsCount } = await supabaseAdmin
          .from('lead_tags')
          .delete({ count: 'exact' })
          .in('lead_id', ids)
        results.lead_tags = tagsCount || 0
      }

      const { count: attachmentsCount } = await supabaseAdmin
        .from('lead_attachments')
        .delete({ count: 'exact' })
        .eq('company_id', companyId)
      results.lead_attachments = attachmentsCount || 0

      const { count: scheduledCount } = await supabaseAdmin
        .from('scheduled_messages')
        .delete({ count: 'exact' })
        .eq('company_id', companyId)
      results.scheduled_messages = scheduledCount || 0

      const { count: leadsCount } = await supabaseAdmin
        .from('leads')
        .delete({ count: 'exact' })
        .eq('company_id', companyId)
      results.leads = leadsCount || 0
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in admin-data-cleanup:', error)
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
