import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(url, serviceKey);

    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
    const isMaster = (roles || []).some((r: any) => r.role === 'master');
    if (!isMaster) {
      return new Response(JSON.stringify({ error: 'Apenas Master pode excluir empresas' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { company_id } = await req.json();
    if (!company_id || typeof company_id !== 'string') {
      return new Response(JSON.stringify({ error: 'company_id obrigatório' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Server-side data check
    const [u, l, c] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', company_id),
      admin.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', company_id),
      admin.from('conversations').select('id', { count: 'exact', head: true }).eq('company_id', company_id),
    ]);
    const counts = { users: u.count || 0, leads: l.count || 0, conversations: c.count || 0 };
    if (counts.users || counts.leads || counts.conversations) {
      return new Response(JSON.stringify({ error: 'has_data', counts }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: delErr } = await admin.from('companies').delete().eq('id', company_id);
    if (delErr) {
      console.error('delete company error', delErr);
      return new Response(JSON.stringify({ error: delErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('admin-delete-company error', e);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
