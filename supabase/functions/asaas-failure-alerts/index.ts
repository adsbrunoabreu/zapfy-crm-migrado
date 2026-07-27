// Cron 5min: detecta falhas repetidas no Asaas e dispara alertas (e-mail + webhook).
// Lê config em system_integrations.asaas.value.alerts.
// State (last_alerted_at) salvo no mesmo blob para idempotência por cooldown.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-key',
};

interface AlertsConfig {
  enabled?: boolean;
  threshold?: number;
  window_minutes?: number;
  cooldown_minutes?: number;
  extra_emails?: string[];
  webhook_url?: string;
  last_alerted_at?: string | null;
  last_count?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const APP_URL = Deno.env.get('APP_URL') || 'https://zapfycrm.lovable.app';
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // body opcional: { force?: boolean } — para teste manual
  let force = false;
  try { const b = await req.json(); force = !!b?.force; } catch { /* no body */ }

  try {
    const { data: cfgRow } = await admin
      .from('system_integrations')
      .select('value')
      .eq('key', 'asaas')
      .maybeSingle();
    const cfg = (cfgRow?.value as any) || {};
    const alerts: AlertsConfig = cfg.alerts || {};

    if (!alerts.enabled && !force) {
      return new Response(JSON.stringify({ ok: true, skipped: 'alerts_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const threshold = Math.max(1, Number(alerts.threshold) || 5);
    const windowMin = Math.max(1, Number(alerts.window_minutes) || 15);
    const cooldownMin = Math.max(5, Number(alerts.cooldown_minutes) || 60);

    const now = new Date();
    const since = new Date(now.getTime() - windowMin * 60_000).toISOString();

    // Conta falhas
    const { count: failCount } = await admin
      .from('asaas_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', since)
      .eq('ok', false);

    const failures = failCount ?? 0;

    // Cooldown
    const lastAlertedAt = alerts.last_alerted_at ? new Date(alerts.last_alerted_at) : null;
    const cooldownActive = lastAlertedAt && now.getTime() - lastAlertedAt.getTime() < cooldownMin * 60_000;

    if (!force && (failures < threshold || cooldownActive)) {
      return new Response(
        JSON.stringify({
          ok: true,
          window_minutes: windowMin,
          failures,
          threshold,
          cooldown_active: !!cooldownActive,
          fired: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Coleta últimas falhas para o corpo do alerta
    const { data: lastFails } = await admin
      .from('asaas_logs')
      .select('id, created_at, action, event, http_status, error_message, direction')
      .gte('created_at', since)
      .eq('ok', false)
      .order('created_at', { ascending: false })
      .limit(10);

    // Destinatários: master + admins + extras
    const { data: people } = await admin
      .from('profiles')
      .select('email, full_name, role')
      .in('role', ['master', 'admin'])
      .eq('is_active', true);
    const baseEmails = (people || []).map((p) => p.email).filter(Boolean) as string[];
    const extras = (alerts.extra_emails || []).filter((e) => typeof e === 'string' && e.includes('@'));
    const recipients = Array.from(new Set([...baseEmails, ...extras]));

    const logsUrl = `${APP_URL}/admin/integrations?tab=asaas#asaas-logs`;
    const subject = `🚨 Asaas: ${failures} falhas nos últimos ${windowMin} min`;

    const rowsHtml = (lastFails || [])
      .map(
        (l) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:11px">${new Date(l.created_at).toLocaleString('pt-BR')}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb">${l.direction || ''} · ${l.action || l.event || '-'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;color:#dc2626">${l.http_status ?? '—'}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:12px;max-width:340px">${(l.error_message || '').slice(0, 180)}</td>
        </tr>`,
      )
      .join('');

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#111">
        <h2 style="color:#dc2626;margin:0 0 8px">⚠️ Falhas repetidas na integração Asaas</h2>
        <p style="margin:0 0 16px;color:#374151">
          Detectamos <strong>${failures}</strong> falha(s) nos últimos
          <strong>${windowMin}</strong> minutos (threshold: ${threshold}).
        </p>
        <p style="margin:0 0 16px">
          <a href="${logsUrl}" style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">
            Ver logs do Asaas →
          </a>
        </p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:8px">
          <thead><tr style="background:#f3f4f6">
            <th style="padding:8px 10px;text-align:left">Quando</th>
            <th style="padding:8px 10px;text-align:left">Ação</th>
            <th style="padding:8px 10px;text-align:left">HTTP</th>
            <th style="padding:8px 10px;text-align:left">Erro</th>
          </tr></thead>
          <tbody>${rowsHtml || '<tr><td colspan="4" style="padding:12px;color:#6b7280">Sem detalhes</td></tr>'}</tbody>
        </table>
        <p style="margin-top:24px;font-size:12px;color:#6b7280">
          Você está recebendo este alerta porque está configurado como destinatário em
          Integrações → Asaas → Alertas.
        </p>
      </div>
    `.trim();

    const results: any = { email: null, webhook: null };

    // E-mail
    if (recipients.length > 0) {
      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-key': SERVICE_KEY },
          body: JSON.stringify({ to: recipients, subject, html }),
        });
        results.email = { ok: r.ok, status: r.status, recipients: recipients.length };
      } catch (e: any) {
        results.email = { ok: false, error: e?.message };
      }
    }

    // Webhook
    if (alerts.webhook_url) {
      try {
        const r = await fetch(alerts.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'asaas.failures.repeated',
            failures,
            window_minutes: windowMin,
            threshold,
            logs_url: logsUrl,
            sample: lastFails || [],
            fired_at: now.toISOString(),
          }),
        });
        results.webhook = { ok: r.ok, status: r.status };
      } catch (e: any) {
        results.webhook = { ok: false, error: e?.message };
      }
    }

    // Persistir last_alerted_at
    const newAlerts = { ...alerts, last_alerted_at: now.toISOString(), last_count: failures };
    const newCfg = { ...cfg, alerts: newAlerts };
    await admin.from('system_integrations').update({ value: newCfg, updated_at: now.toISOString() }).eq('key', 'asaas');

    // Notificação in-app para masters
    try {
      const { data: masters } = await admin
        .from('user_roles')
        .select('user_id')
        .eq('role', 'master');
      const rows = (masters || []).map((m: any) => ({
        user_id: m.user_id,
        type: 'asaas_failures',
        title: subject,
        message: `${failures} falha(s) em ${windowMin} min. Veja os logs.`,
        link: '/admin/integrations?tab=asaas',
        severity: 'error',
        metadata: { failures, threshold, window_minutes: windowMin },
      }));
      if (rows.length) await admin.from('app_notifications').insert(rows);
    } catch { /* tabela pode ter outras colunas */ }

    await admin.from('system_logs').insert({
      source: 'asaas_failure_alerts',
      level: 'warn',
      event: 'asaas.alert.fired',
      message: `Asaas: ${failures} falhas / ${windowMin}min`,
      metadata: { failures, threshold, window_minutes: windowMin, results, force },
    });

    return new Response(
      JSON.stringify({ ok: true, fired: true, failures, threshold, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'erro' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
