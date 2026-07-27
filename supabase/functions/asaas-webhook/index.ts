// Asaas webhook receiver. Public endpoint validated by ASAAS_WEBHOOK_TOKEN header.
// Idempotent via payment_attempts.asaas_payment_id + event combination.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, asaas-access-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const expected = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
  const got = req.headers.get('asaas-access-token');
  if (!expected || got !== expected) return json(401, { error: 'Unauthorized' });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  let body: any = null;
  try {
    body = await req.json();
    const event: string = body.event || '';
    const payment = body.payment || body.subscription || {};
    const asaasPaymentId: string | null = payment?.id || null;
    const subscriptionAsaasId: string | null = payment?.subscription || null;

    // Find local subscription by asaas_subscription_id
    let localSub: any = null;
    if (subscriptionAsaasId) {
      const { data } = await admin
        .from('subscriptions')
        .select('id, company_id, billing_cycle, monthly_price, plan_name')
        .eq('asaas_subscription_id', subscriptionAsaasId)
        .maybeSingle();
      localSub = data;
    }

    // Audit
    await admin.from('payment_attempts').insert({
      company_id: localSub?.company_id || null,
      subscription_id: localSub?.id || null,
      asaas_payment_id: asaasPaymentId,
      event,
      status: payment?.status || null,
      amount: payment?.value || null,
      raw: body,
    });

    // Ensure invoice row exists for this payment
    async function ensureInvoice() {
      if (!asaasPaymentId || !localSub) return null;
      const { data: existing } = await admin
        .from('invoices')
        .select('id')
        .eq('asaas_payment_id', asaasPaymentId)
        .maybeSingle();
      if (existing) return existing.id;

      const periodStart = payment?.dateCreated ? new Date(payment.dateCreated) : new Date();
      const periodEnd = payment?.dueDate ? new Date(payment.dueDate) : new Date(Date.now() + 30 * 86400000);
      const { data: numRow } = await admin.rpc('next_invoice_number');
      const { data: ins } = await admin
        .from('invoices')
        .insert({
          company_id: localSub.company_id,
          subscription_id: localSub.id,
          invoice_number: numRow as unknown as string,
          amount: payment.value || localSub.monthly_price || 0,
          currency: 'BRL',
          billing_cycle: localSub.billing_cycle,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          status: 'open',
          asaas_payment_id: asaasPaymentId,
          asaas_invoice_url: payment.invoiceUrl || null,
          due_date: payment.dueDate || null,
          payment_method: (payment.billingType || '').toUpperCase() || null,
          description: `Cobrança ${localSub.plan_name}`,
        })
        .select('id')
        .single();
      return ins?.id || null;
    }

    switch (event) {
      case 'PAYMENT_CREATED':
      case 'PAYMENT_UPDATED':
      case 'PAYMENT_AWAITING_RISK_ANALYSIS':
        await ensureInvoice();
        break;

      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_RECEIVED_IN_CASH':
      case 'PAYMENT_ANTICIPATED': {
        await ensureInvoice();
        if (asaasPaymentId) {
          await admin.rpc('apply_paid_invoice', {
            _asaas_payment_id: asaasPaymentId,
            _paid_at: payment?.paymentDate ? new Date(payment.paymentDate).toISOString() : new Date().toISOString(),
            _method: (payment?.billingType || '').toUpperCase() || null,
            _amount: payment?.value || null,
            _invoice_url: payment?.invoiceUrl || null,
          });
        }
        // Fire server-side tracking for purchase event
        if (localSub) {
          fetch(`${SUPABASE_URL}/functions/v1/tracking-dispatch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': Deno.env.get('CRON_SECRET') || '',
            },
            body: JSON.stringify({
              event_name: 'Purchase',
              event_id: `asaas_${asaasPaymentId}`,
              company_id: localSub.company_id,
              value: payment?.value,
              currency: 'BRL',
              custom_data: { content_name: localSub.plan_name, payment_method: (payment?.billingType || '').toUpperCase() },
              source: 'server',
              action_source: 'website',
            }),
          }).catch((e) => console.error('tracking-dispatch error', e));
        }
        break;
      }

      case 'PAYMENT_OVERDUE':
        await ensureInvoice();
        if (asaasPaymentId) await admin.rpc('mark_invoice_overdue', { _asaas_payment_id: asaasPaymentId });
        break;

      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
      case 'PAYMENT_CHARGEBACK_REQUESTED':
      case 'PAYMENT_CHARGEBACK_DISPUTE': {
        if (asaasPaymentId) {
          await admin.from('invoices').update({ status: 'canceled' }).eq('asaas_payment_id', asaasPaymentId);
        }
        break;
      }

      default:
        // ignore others (subscription events, etc.)
        break;
    }

    // ------------------------------------------------------------------
    // Sync com Lead (CRM): cria/atualiza lead vinculado ao pagamento
    // ------------------------------------------------------------------
    let syncedLeadId: string | null = null;
    try {
      // Determinar company_id: prioriza subscription local; depois customer no companies
      let targetCompanyId: string | null = localSub?.company_id || null;
      if (!targetCompanyId && payment?.customer) {
        const { data: byCustomer } = await admin
          .from('companies')
          .select('id')
          .eq('asaas_customer_id', payment.customer)
          .maybeSingle();
        targetCompanyId = byCustomer?.id || null;
      }

      if (targetCompanyId && payment?.customer) {
        // Buscar dados do customer (CPF/CNPJ etc.) na API Asaas
        const ASAAS_API_KEY = Deno.env.get('ASAAS_API_KEY');
        let customer: any = {};
        if (ASAAS_API_KEY) {
          const { data: cfg } = await admin
            .from('system_integrations').select('value').eq('key', 'asaas').maybeSingle();
          const env = ((cfg?.value as any)?.environment === 'live' ? 'live' : 'sandbox');
          const base = env === 'live' ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
          try {
            const r = await fetch(`${base}/customers/${payment.customer}`, {
              headers: { 'access_token': ASAAS_API_KEY, 'User-Agent': 'CredFlowCRM/1.0' },
            });
            if (r.ok) customer = await r.json();
          } catch (e) {
            console.warn('asaas customer fetch failed', e);
          }
        }

        const { data: leadId, error: rpcErr } = await admin.rpc('sync_asaas_payment_to_lead', {
          _company_id: targetCompanyId,
          _event: event,
          _payment: payment,
          _customer: customer,
        });
        if (rpcErr) console.error('sync_asaas_payment_to_lead rpc error', rpcErr);
        syncedLeadId = (leadId as unknown as string) || null;
      }
    } catch (syncErr) {
      console.error('lead-sync error', syncErr);
    }

    await admin.from('asaas_logs').insert({
      company_id: localSub?.company_id || null,
      direction: 'webhook_in',
      event,
      action: event,
      http_status: 200,
      ok: true,
      request_payload: body,
      response_payload: { ok: true, lead_id: syncedLeadId },
      asaas_payment_id: asaasPaymentId,
    });

    return json(200, { ok: true, lead_id: syncedLeadId });
  } catch (e) {
    console.error('asaas-webhook error', e);
    const errMsg = e instanceof Error ? e.message : 'Internal error';
    try {
      await admin.from('asaas_logs').insert({
        direction: 'webhook_in',
        event: body?.event || null,
        action: body?.event || null,
        http_status: 500,
        ok: false,
        request_payload: body,
        error_message: errMsg,
        asaas_payment_id: body?.payment?.id || body?.subscription?.id || null,
      });
    } catch (_) { /* ignore */ }
    return json(500, { error: errMsg });
  }
});
