import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Cria uma empresa "padrão" para usuários autenticados que ainda não têm
 * company_id (ex.: signup via Google OAuth). Promove o usuário a company_admin.
 * Idempotente: se já houver company_id, retorna sem alterar nada.
 * Se houver convite pendente para o e-mail, NÃO cria empresa — deixa o fluxo
 * de invite seguir normalmente.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado.' }, 401);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Identifica o usuário a partir do JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: 'Sessão inválida.' }, 401);
    const user = userData.user;

    // Já tem empresa? Nada a fazer.
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, full_name, company_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.company_id) {
      return json({ ok: true, company_id: profile.company_id, created: false });
    }

    const email = (profile?.email || user.email || '').toLowerCase();

    // Existe convite pendente para esse e-mail? Não cria empresa.
    if (email) {
      const { data: invite } = await admin
        .from('team_invites')
        .select('id')
        .eq('email', email)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (invite) {
        return json({ ok: true, has_pending_invite: true, created: false });
      }
    }

    const fullName =
      profile?.full_name ||
      (user.user_metadata as any)?.full_name ||
      (user.user_metadata as any)?.name ||
      email.split('@')[0] ||
      'Titular';

    // 1. Cria empresa com trial
    const { data: company, error: companyErr } = await admin
      .from('companies')
      .insert({
        name: `Empresa de ${fullName}`,
        email,
        timezone: 'America/Sao_Paulo',
        plan_status: 'trial',
        trial_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (companyErr || !company) {
      return json({ error: companyErr?.message || 'Erro ao criar empresa.' }, 500);
    }

    // 2. Vincula profile + role company_admin (claim atômico).
    // Só vincula se ainda estiver SEM company_id — protege contra
    // chamadas paralelas (ex.: StrictMode/double mount no OAuth callback).
    const { data: linked, error: profileErr } = await admin
      .from('profiles')
      .update({ company_id: company.id, role: 'admin', full_name: fullName })
      .eq('id', user.id)
      .is('company_id', null)
      .select('id')
      .maybeSingle();
    if (profileErr) {
      await admin.from('companies').delete().eq('id', company.id);
      return json({ error: profileErr.message }, 500);
    }
    if (!linked) {
      // Outra requisição já vinculou — descarta esta empresa e retorna a existente.
      await admin.from('companies').delete().eq('id', company.id);
      const { data: existing } = await admin
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();
      return json({ ok: true, company_id: existing?.company_id, created: false });
    }

    // 3. user_roles (fonte de verdade de RLS)
    const { error: roleErr } = await admin
      .from('user_roles')
      .upsert(
        { user_id: user.id, role: 'admin' },
        { onConflict: 'user_id,role', ignoreDuplicates: true },
      );
    if (roleErr && !roleErr.message.includes('duplicate')) {
      return json({ error: roleErr.message }, 500);
    }

    return json({ ok: true, company_id: company.id, created: true });
  } catch (e: any) {
    return json({ error: e?.message || 'Erro inesperado.' }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
