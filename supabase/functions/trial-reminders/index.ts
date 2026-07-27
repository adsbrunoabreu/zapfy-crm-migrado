import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUBLIC_APP_URL = Deno.env.get('PUBLIC_APP_URL') || 'https://zapfycrm.lovable.app';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const { data: targets, error } = await admin.rpc('get_trial_reminder_targets');
    if (error) throw error;

    const results: any[] = [];

    await admin.from('system_logs').insert({
      source: 'trial_reminders',
      level: 'info',
      event: 'trial_reminders.tick',
      message: `Verificando ${(targets ?? []).length} empresas em trial`,
      metadata: { targets: (targets ?? []).length },
    });

    for (const t of (targets ?? []) as any[]) {
      const isExpired = t.needs_expired_reminder;
      const is12h = !isExpired && t.needs_12h_reminder;
      const is6h = !isExpired && !is12h && t.needs_6h_reminder;
      const slug = isExpired ? 'trial_expired' : 'trial_ending_soon';
      const ctaUrl = `${PUBLIC_APP_URL}/subscription`;

      // Buscar admins (company_admin) da empresa
      const { data: roleRows } = await admin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      const adminIds = (roleRows ?? []).map((r) => r.user_id);
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email, full_name, company_id')
        .eq('company_id', t.company_id)
        .in('id', adminIds.length ? adminIds : ['00000000-0000-0000-0000-000000000000']);

      const recipients = (profiles ?? []).filter((p) => !!p.email);
      const hoursLeft = Math.max(0, Math.round(Number(t.hours_left) || 0));

      // Notificações in-app
      if (recipients.length) {
        await admin.from('app_notifications').insert(
          recipients.map((p) => ({
            user_id: p.id,
            company_id: t.company_id,
            type: isExpired ? 'trial_expired' : 'trial_ending_soon',
            title: isExpired ? 'Seu teste grátis terminou' : `Seu trial acaba em ~${hoursLeft}h`,
            message: isExpired
              ? 'Assine um plano agora para reativar o acesso da sua empresa.'
              : 'Escolha um plano e mantenha sua empresa ativa sem interrupções.',
            severity: isExpired ? 'error' : 'warning',
            link: '/subscription',
            metadata: { hours_left: hoursLeft, trial_ends_at: t.trial_ends_at },
          })),
        );
      }

      // E-mails (1 por destinatário)
      for (const p of recipients) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-key': SERVICE_KEY,
            },
            body: JSON.stringify({
              template_slug: slug,
              to: p.email,
              company_id: t.company_id,
              variables: {
                user_name: p.full_name || p.email.split('@')[0],
                company_name: t.company_name,
                hours_left: String(hoursLeft),
                cta_url: ctaUrl,
              },
            }),
          });
        } catch (e) {
          console.error('send-email failed', p.email, (e as Error).message);
        }
      }

      // Marcar como enviado
      const patch = isExpired
        ? { trial_expired_notified_at: new Date().toISOString() }
        : is12h
          ? { trial_reminder_12h_sent_at: new Date().toISOString() }
          : { trial_reminder_6h_sent_at: new Date().toISOString() };
      await admin.from('companies').update(patch).eq('id', t.company_id);

      results.push({
        company_id: t.company_id,
        kind: isExpired ? 'expired' : is12h ? '12h' : '6h',
        recipients: recipients.length,
      });
    }

    return new Response(
      JSON.stringify({ ok: true, processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('trial-reminders error', e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
