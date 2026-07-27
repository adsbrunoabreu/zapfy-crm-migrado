import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Client with user's auth token for validation
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Usuário não autenticado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Admin client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is company_admin or master
    const { data: userRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'master'])
      .maybeSingle();

    if (!userRole) {
      console.error('User is not admin:', user.id);
      return new Response(
        JSON.stringify({ error: 'Apenas administradores podem criar membros' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get admin's company_id
    const { data: adminProfile } = await supabaseAdmin
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single();

    // Parse request body
    const { name, email, password, role, company_id: bodyCompanyId } = await req.json();

    // Master can target any company; otherwise force user's own company
    const isMaster = userRole.role === 'master';
    const targetCompanyId = isMaster && bodyCompanyId ? bodyCompanyId : adminProfile?.company_id;

    if (!targetCompanyId) {
      return new Response(
        JSON.stringify({ error: 'Empresa de destino não definida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Plan limit check: bloqueia ANTES de criar o auth.user para não orfãnar
    // (Master ignora limites)
    if (!isMaster) {
      const [{ data: limits }, { data: usage }] = await Promise.all([
        supabaseAdmin.rpc('get_company_plan_limits', { _company_id: targetCompanyId }).maybeSingle(),
        supabaseAdmin.rpc('get_company_plan_usage', { _company_id: targetCompanyId }).maybeSingle(),
      ]);
      const maxUsers = (limits as any)?.max_users ?? null;
      if (maxUsers !== null) {
        const used = ((usage as any)?.users_count ?? 0) + ((usage as any)?.pending_invites_count ?? 0);
        if (used >= maxUsers) {
          return new Response(
            JSON.stringify({
              error: `PLAN_LIMIT_USERS: limite de ${maxUsers} usuário(s) do plano atingido. Faça upgrade para adicionar mais membros.`,
            }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Validate inputs
    if (!name || !email || !password || !role) {
      return new Response(
        JSON.stringify({ error: 'Todos os campos são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (password.length < 6) {
      return new Response(
        JSON.stringify({ error: 'Senha deve ter no mínimo 6 caracteres' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normaliza valores legados ('user' → 'agente', 'company_admin' → 'admin')
    const roleMap: Record<string, string> = { user: 'agente', company_admin: 'admin' };
    const normalizedRole = roleMap[role] ?? role;
    if (!['agente', 'admin'].includes(normalizedRole)) {
      return new Response(
        JSON.stringify({ error: 'Função inválida' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: 'Este email já está cadastrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating user:', { email, name, role, company_id: targetCompanyId });

    // Create user using Admin API
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        role: normalizedRole
      }
    });

    if (createError) {
      console.error('Error creating user:', createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User created:', newUser.user.id);

    // Update profile with company_id and role
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        company_id: targetCompanyId,
        full_name: name,
        role: normalizedRole
      })
      .eq('id', newUser.user.id);

    if (profileError) {
      console.error('Error updating profile:', profileError);
    }

    // Create user_role entry
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: newUser.user.id,
        role: normalizedRole
      });

    if (roleError) {
      console.error('Error creating user role:', roleError);
    }

    console.log('Member created successfully:', newUser.user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { 
          id: newUser.user.id, 
          email: newUser.user.email,
          name 
        } 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in create-team-member:', error);
    const message = error instanceof Error ? error.message : 'Erro interno do servidor';
    return new Response(
      JSON.stringify({ error: message, code: 'SERVICE_FAILED', fallback: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
