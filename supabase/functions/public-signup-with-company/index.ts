import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Body {
  full_name: string;
  email: string;
  password: string;
  selected_plan_id?: string | null;
  selected_billing_cycle?: 'monthly' | 'yearly' | null;
  consent?: {
    accepted: boolean;
    version: string;
    user_agent?: string | null;
  };
  company: {
    name: string;
    trade_name?: string | null;
    legal_name?: string | null;
    cnpj?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    zip_code?: string | null;
    address?: string | null;
    address_number?: string | null;
    address_complement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    timezone?: string | null;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    const { full_name, email, password, company, selected_plan_id, selected_billing_cycle, consent } = body;

    if (!consent?.accepted || !consent?.version) {
      return json({ error: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade.' }, 400);
    }
    if (!full_name?.trim() || !email?.trim() || !password || password.length < 6) {
      return json({ error: 'Nome, e-mail e senha (mín. 6) são obrigatórios.' }, 400);
    }
    if (!company?.name?.trim()) {
      return json({ error: 'Nome da empresa é obrigatório.' }, 400);
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || null;
    const cleanEmail = email.trim().toLowerCase();

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Validate plan id if provided
    let validPlanId: string | null = null;
    if (selected_plan_id) {
      const { data: planRow } = await admin
        .from('subscription_plans')
        .select('id')
        .eq('id', selected_plan_id)
        .eq('is_active', true)
        .maybeSingle();
      if (planRow) validPlanId = planRow.id as string;
    }

    // -----------------------------------------------------------
    // 1. CREATE USER FIRST.
    // auth.users tem unique constraint em email — se duas chamadas
    // paralelas tentarem o mesmo e-mail, apenas uma vence.
    // Isso garante idempotência sem criar empresas órfãs.
    // -----------------------------------------------------------
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name, role: 'admin' },
    });

    if (createErr || !created?.user) {
      const msg = (createErr?.message || '').toLowerCase();
      if (msg.includes('already') || msg.includes('registered') || msg.includes('exists') || msg.includes('duplicate')) {
        return json({ error: 'Este e-mail já está cadastrado.' }, 409);
      }
      return json({ error: createErr?.message || 'Erro ao criar usuário.' }, 500);
    }

    const userId = created.user.id;

    // Helper de rollback caso algo falhe daqui pra frente.
    const rollbackUser = async () => {
      try { await admin.auth.admin.deleteUser(userId); } catch (_) { /* swallow */ }
    };

    try {
      // 2. Create company
      const { data: createdCompany, error: companyErr } = await admin
        .from('companies')
        .insert({
          name: company.name.trim(),
          trade_name: company.trade_name?.trim() || null,
          legal_name: company.legal_name?.trim() || null,
          cnpj: company.cnpj?.replace(/\D/g, '') || null,
          email: company.email?.trim() || cleanEmail,
          phone: company.phone?.replace(/\D/g, '') || null,
          website: company.website?.trim() || null,
          zip_code: company.zip_code?.replace(/\D/g, '') || null,
          address: company.address?.trim() || null,
          address_number: company.address_number?.trim() || null,
          address_complement: company.address_complement?.trim() || null,
          neighborhood: company.neighborhood?.trim() || null,
          city: company.city?.trim() || null,
          state: company.state?.trim() || null,
          timezone: company.timezone || 'America/Sao_Paulo',
          plan_status: 'trial',
          trial_ends_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          selected_plan_id: validPlanId,
        })
        .select()
        .single();
      if (companyErr || !createdCompany) {
        throw new Error(companyErr?.message || 'Erro ao criar empresa.');
      }

      // 3. Link profile à empresa + role company_admin
      const { error: profileErr } = await admin
        .from('profiles')
        .update({ company_id: createdCompany.id, role: 'admin', full_name })
        .eq('id', userId);
      if (profileErr) {
        await admin.from('companies').delete().eq('id', createdCompany.id);
        throw new Error(profileErr.message);
      }

      const { error: roleErr } = await admin
        .from('user_roles')
        .upsert(
          { user_id: userId, role: 'admin' },
          { onConflict: 'user_id,role', ignoreDuplicates: true },
        );
      if (roleErr && !roleErr.message.includes('duplicate')) {
        await admin.from('companies').delete().eq('id', createdCompany.id);
        throw new Error(roleErr.message);
      }

      // 4. Consentimento (auditoria legal)
      const { error: consentErr } = await admin.from('user_consents').insert({
        user_id: userId,
        kind: 'terms_privacy',
        version: consent.version,
        context: 'signup',
        ip,
        user_agent: consent.user_agent || req.headers.get('user-agent'),
      });
      if (consentErr) {
        await admin.from('companies').delete().eq('id', createdCompany.id);
        throw new Error(consentErr.message);
      }

      // 5. Seed (não-bloqueante)
      try {
        const { error: seedErr } = await admin.rpc('seed_company_demo_data', {
          p_company_id: createdCompany.id,
        });
        if (seedErr) console.error('[seed_company_demo_data] failed:', seedErr.message);
      } catch (seedExc) {
        console.error('[seed_company_demo_data] exception:', seedExc);
      }

      return json({ ok: true, company_id: createdCompany.id, user_id: userId }, 200);
    } catch (e: any) {
      await rollbackUser();
      return json({ error: e.message || 'Erro ao finalizar cadastro.' }, 500);
    }
  } catch (e: any) {
    return json({ error: e.message || 'Erro inesperado.' }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
