import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'Não autorizado' })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const token = authHeader.replace('Bearer ', '')
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) return json(401, { error: 'Token inválido' })
    const userId = userData.user.id
    const userEmail = userData.user.email!

    // Master gate
    const { data: roles } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'master')
    if (!roles || roles.length === 0) return json(403, { error: 'Apenas Master' })

    const body = await req.json().catch(() => null)
    if (!body) return json(400, { error: 'Corpo inválido' })

    const { company_id, mode, days, password } = body as {
      company_id?: string
      mode?: 'wipe' | 'seed' | 'reseed'
      days?: number
      password?: string
    }

    if (!company_id || !/^[0-9a-f-]{36}$/i.test(company_id)) return json(400, { error: 'company_id inválido' })
    if (!mode || !['wipe', 'seed', 'reseed'].includes(mode)) return json(400, { error: 'mode inválido' })
    if (!password) return json(400, { error: 'senha obrigatória' })
    const nDays = Math.max(1, Math.min(90, Number(days ?? 30)))

    // Rate limit (5/15min)
    const MAX_ATTEMPTS = 5
    const LOCK_MIN = 15
    const { data: attempt } = await admin
      .from('admin_action_attempts')
      .select('attempts, locked_until')
      .eq('user_id', userId)
      .eq('action', 'seed_demo')
      .maybeSingle()
    if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
      return json(429, { error: 'Muitas tentativas. Tente novamente em alguns minutos.' })
    }

    // Verify password using anon client
    const anon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: signErr } = await anon.auth.signInWithPassword({ email: userEmail, password })
    if (signErr) {
      const next = (attempt?.attempts ?? 0) + 1
      await admin.from('admin_action_attempts').upsert({
        user_id: userId,
        action: 'seed_demo',
        attempts: next,
        locked_until: next >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MIN * 60_000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      return json(401, { error: 'Senha incorreta' })
    }
    await admin.from('admin_action_attempts').upsert({
      user_id: userId,
      action: 'seed_demo',
      attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })

    // Dispatch via RPC (functions são SECURITY DEFINER + has_role check;
    // service-role bypassa RLS mas precisamos invocar has_role com auth.uid()).
    // Estratégia: usar postgrest no nome do usuário logado, repassando o JWT.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let result: unknown
    if (mode === 'wipe') {
      const { data, error } = await userClient.rpc('wipe_company_operational', { p_company_id: company_id })
      if (error) return json(500, { error: error.message, details: error })
      result = data
    } else if (mode === 'seed') {
      const { data, error } = await userClient.rpc('seed_company_realistic', {
        p_company_id: company_id,
        p_days: nDays,
      })
      if (error) return json(500, { error: error.message, details: error })
      result = data
    } else {
      const { data, error } = await userClient.rpc('reseed_company_demo', {
        p_company_id: company_id,
        p_days: nDays,
      })
      if (error) return json(500, { error: error.message, details: error })
      result = data
    }

    await admin.from('system_logs').insert({
      level: 'info',
      action: `seed_demo_${mode}`,
      company_id,
      payload: { actor: userId, days: nDays, result },
    })

    return json(200, { success: true, mode, days: nDays, result })
  } catch (e) {
    console.error('seed-demo-data error', e)
    return json(500, { error: 'Erro interno', message: (e as Error).message })
  }
})
