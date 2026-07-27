import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type AsaasAction =
  | 'ping'
  | 'createCustomer'
  | 'createSubscription'
  | 'updateSubscription'
  | 'cancelSubscription'
  | 'getSubscription'
  | 'tokenizeCreditCard'
  | 'getPixQrCode'
  | 'listPayments'
  | 'getPayment';

export async function callAsaas<T = any>(action: AsaasAction, payload: Record<string, any> = {}): Promise<T> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');

  const { data, error } = await supabase.functions.invoke('asaas-proxy', {
    body: { action, payload },
    headers: { Authorization: `Bearer ${token}` },
  });
  if (error) {
    let msg = error.message;
    try {
      const ctx: any = (error as any)?.context;
      if (ctx && typeof ctx.clone === 'function') {
        const text = await ctx.clone().text();
        const j = text ? JSON.parse(text) : null;
        if (j?.error) msg = j.error;
      } else if (ctx) {
        const j = typeof ctx === 'string' ? JSON.parse(ctx) : ctx;
        if (j?.error) msg = j.error;
      }
    } catch {}
    throw new Error(msg || 'Erro na chamada Asaas');
  }
  return data as T;
}

export interface CardData {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface CardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  addressComplement?: string;
  phone: string;
  mobilePhone?: string;
}

export interface CreateSubscriptionPayload {
  customer: string;
  billingType: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
  value: number;
  cycle: 'MONTHLY' | 'YEARLY';
  nextDueDate: string; // YYYY-MM-DD
  description?: string;
  creditCard?: CardData;
  creditCardHolderInfo?: CardHolderInfo;
  creditCardToken?: string;
}

export function useAsaasCheckout(companyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      planId: string;
      planName: string;
      amount: number;
      cycle: 'MONTHLY' | 'YEARLY';
      billingType: 'CREDIT_CARD' | 'PIX' | 'BOLETO';
      customer: { name: string; email: string; cpfCnpj: string; phone?: string; postalCode?: string; addressNumber?: string };
      card?: CardData;
      cardHolder?: CardHolderInfo;
    }) => {
      // 1. Create or reuse customer
      let customerId: string | null = null;
      const { data: companyRow } = await supabase
        .from('companies')
        .select('asaas_customer_id')
        .eq('id', companyId!)
        .maybeSingle();
      customerId = companyRow?.asaas_customer_id || null;

      if (!customerId) {
        const created = await callAsaas<any>('createCustomer', {
          name: args.customer.name,
          email: args.customer.email,
          cpfCnpj: args.customer.cpfCnpj.replace(/\D/g, ''),
          phone: args.customer.phone,
          postalCode: args.customer.postalCode,
          addressNumber: args.customer.addressNumber,
          notificationDisabled: false,
        });
        customerId = created?.id;
        if (!customerId) throw new Error('Falha ao criar cliente Asaas');
      }

      // 2. Build subscription payload
      const today = new Date();
      const nextDue = new Date(today.getTime() + 1 * 86400000); // +1 day
      const nextDueDate = nextDue.toISOString().slice(0, 10);

      const payload: CreateSubscriptionPayload = {
        customer: customerId!,
        billingType: args.billingType,
        value: args.amount,
        cycle: args.cycle,
        nextDueDate,
        description: `${args.planName} (${args.cycle === 'YEARLY' ? 'Anual' : 'Mensal'})`,
      };

      if (args.billingType === 'CREDIT_CARD') {
        if (!args.card || !args.cardHolder) throw new Error('Dados do cartão obrigatórios');
        payload.creditCard = args.card;
        payload.creditCardHolderInfo = args.cardHolder;
      }

      let sub: any;
      try {
        sub = await callAsaas<any>('createSubscription', payload);
      } catch (err: any) {
        const msg = String(err?.message || '');
        // Customer ID stale (e.g. created in sandbox, now using live env). The proxy
        // already cleared it — recreate the customer once and retry the subscription.
        if (/invalid_customer|cliente inv[áa]lido/i.test(msg)) {
          const recreated = await callAsaas<any>('createCustomer', {
            name: args.customer.name,
            email: args.customer.email,
            cpfCnpj: args.customer.cpfCnpj.replace(/\D/g, ''),
            phone: args.customer.phone,
            postalCode: args.customer.postalCode,
            addressNumber: args.customer.addressNumber,
            notificationDisabled: false,
          });
          if (!recreated?.id) throw new Error('Falha ao recriar cliente Asaas');
          payload.customer = recreated.id;
          sub = await callAsaas<any>('createSubscription', payload);
        } else {
          throw err;
        }
      }
      if (!sub?.id) throw new Error(sub?.errors?.[0]?.description || 'Falha ao criar assinatura');

      qc.invalidateQueries({ queryKey: ['subscription', companyId] });
      qc.invalidateQueries({ queryKey: ['invoices', companyId] });
      return sub;
    },
  });
}

export function useAsaasCancel(companyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (asaasSubscriptionId: string) => {
      await callAsaas('cancelSubscription', { id: asaasSubscriptionId });
      qc.invalidateQueries({ queryKey: ['subscription', companyId] });
    },
  });
}

export function useAsaasPixQr(asaasPaymentId?: string | null) {
  return useMutation({
    mutationFn: async () => {
      if (!asaasPaymentId) throw new Error('sem pagamento');
      return callAsaas<{ encodedImage: string; payload: string; expirationDate: string }>('getPixQrCode', { id: asaasPaymentId });
    },
  });
}
