import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, CreditCard, QrCode, ShieldCheck, Copy, CheckCircle2, CalendarDays, RefreshCw, History, ArrowLeft, Clock, AlertCircle, PartyPopper } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useAsaasCheckout, callAsaas } from '@/hooks/useAsaas';
import type { SubscriptionPlan } from '@/hooks/useSubscriptionPlans';
import { toast } from 'sonner';
import { trackEvent } from '@/lib/tracking';
import { supabase } from '@/integrations/supabase/client';
import { useSystemIntegrations } from '@/hooks/useSystemIntegrations';
import { useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  plan: SubscriptionPlan | null;
  cycle: 'monthly' | 'yearly';
}

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const onlyDigits = (v: string) => v.replace(/\D/g, '');

const PIX_VALIDITY_MS = 30 * 60 * 1000;

type PixPhase =
  | { phase: 'idle' }
  | { phase: 'loading'; message: string }
  | { phase: 'ready'; payment_id: string; qr: string; payload: string; expiresAt: number; value?: number }
  | { phase: 'paid'; value?: number }
  | { phase: 'error'; message: string };

interface AsaasPayment {
  id: string;
  value: number;
  status: string;
  billingType: string;
  dateCreated: string;
  dueDate?: string;
  paymentDate?: string;
  clientPaymentDate?: string;
  confirmedDate?: string;
  invoiceUrl?: string;
  transactionReceiptUrl?: string;
}

const PAID_STATUSES = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED']);

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Aguardando pagamento', tone: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  RECEIVED: { label: 'Pago', tone: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  CONFIRMED: { label: 'Pago', tone: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  RECEIVED_IN_CASH: { label: 'Pago', tone: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  OVERDUE: { label: 'Vencido', tone: 'bg-rose-500/10 text-rose-500 border-rose-500/30' },
  REFUNDED: { label: 'Estornado', tone: 'bg-muted text-muted-foreground border-border' },
  REFUND_REQUESTED: { label: 'Estorno solicitado', tone: 'bg-muted text-muted-foreground border-border' },
  CHARGEBACK_REQUESTED: { label: 'Chargeback', tone: 'bg-rose-500/10 text-rose-500 border-rose-500/30' },
  CHARGEBACK_DISPUTE: { label: 'Em disputa', tone: 'bg-rose-500/10 text-rose-500 border-rose-500/30' },
  AWAITING_CHARGEBACK_REVERSAL: { label: 'Em análise', tone: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  DUNNING_REQUESTED: { label: 'Cobrança em curso', tone: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
  DUNNING_RECEIVED: { label: 'Pago', tone: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30' },
  AWAITING_RISK_ANALYSIS: { label: 'Em análise', tone: 'bg-amber-500/10 text-amber-500 border-amber-500/30' },
};

function formatRemaining(ms: number) {
  if (ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export function CheckoutInlineDialog({ open, onOpenChange, plan, cycle }: Props) {
  const { profile } = useAuth();
  const companyId = profile?.company_id || undefined;

  const { data: integrations } = useSystemIntegrations();
  const asaasMethods = ((integrations?.asaas?.value as any)?.methods) || { pix: true, credit_card: false, boleto: false };
  const enabledMethods = useMemo(() => {
    const list: Array<'PIX' | 'CREDIT_CARD' | 'BOLETO'> = [];
    if (asaasMethods.pix) list.push('PIX');
    if (asaasMethods.credit_card) list.push('CREDIT_CARD');
    if (asaasMethods.boleto) list.push('BOLETO');
    return list.length ? list : (['PIX'] as Array<'PIX' | 'CREDIT_CARD' | 'BOLETO'>);
  }, [asaasMethods.pix, asaasMethods.credit_card, asaasMethods.boleto]);

  const [billingType, setBillingType] = useState<'CREDIT_CARD' | 'PIX' | 'BOLETO'>(enabledMethods[0]);
  useEffect(() => {
    if (!enabledMethods.includes(billingType)) setBillingType(enabledMethods[0]);
  }, [enabledMethods, billingType]);

  const [holder, setHolder] = useState({
    name: profile?.full_name || '',
    email: profile?.email || '',
    cpfCnpj: '',
    phone: '',
    postalCode: '',
    addressNumber: '',
  });
  const [card, setCard] = useState({ holderName: '', number: '', expiryMonth: '', expiryYear: '', ccv: '' });
  const [pix, setPix] = useState<PixPhase>({ phase: 'idle' });
  const [now, setNow] = useState(() => Date.now());

  // Histórico PIX
  const [showHistory, setShowHistory] = useState(false);
  const [asaasCustomerId, setAsaasCustomerId] = useState<string | null>(null);
  const [history, setHistory] = useState<AsaasPayment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const checkout = useAsaasCheckout(companyId);
  const qc = useQueryClient();
  const paidNotifiedRef = useRef(false);

  // Countdown 30 min
  useEffect(() => {
    if (pix.phase !== 'ready') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [pix.phase]);

  // Detecção automática de pagamento confirmado (polling Asaas + realtime subscriptions)
  useEffect(() => {
    if (pix.phase !== 'ready' || !pix.payment_id) return;
    let cancelled = false;
    const paymentId = pix.payment_id;
    const value = pix.value;

    const markPaid = () => {
      if (cancelled || paidNotifiedRef.current) return;
      paidNotifiedRef.current = true;
      setPix({ phase: 'paid', value });
      toast.success('Pagamento confirmado!', { description: 'Sua assinatura foi ativada.' });
      trackEvent('purchase', { value, currency: 'BRL', payment_type: 'pix', transaction_id: paymentId });
      qc.invalidateQueries({ queryKey: ['trial-status'] });
      qc.invalidateQueries({ queryKey: ['subscription', companyId] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      // Atualiza histórico para registrar o evento "Pagamento confirmado"
      loadHistory();
      // Fecha o modal automaticamente após breve confirmação visual
      setTimeout(() => { if (!cancelled) onOpenChange(false); }, 2500);
    };

    // Polling Asaas a cada 5s
    const poll = setInterval(async () => {
      try {
        const r = await callAsaas<{ status: string }>('getPayment', { id: paymentId });
        const s = r?.status;
        if (s === 'RECEIVED' || s === 'CONFIRMED' || s === 'RECEIVED_IN_CASH' || s === 'DUNNING_RECEIVED') {
          markPaid();
        }
      } catch (_) {}
    }, 5000);

    // Realtime: muda em invoices (status=paid) ou companies.plan_status='active'
    const channel = companyId
      ? supabase
          .channel(`pix-paid-${paymentId}`)
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'invoices', filter: `company_id=eq.${companyId}` },
            (payload: any) => {
              if (payload?.new?.status === 'paid') markPaid();
            })
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${companyId}` },
            (payload: any) => {
              if (payload?.new?.plan_status === 'active') markPaid();
            })
          .subscribe()
      : null;

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [pix.phase, (pix as any).payment_id, companyId, qc]);


  // Carrega asaas_customer_id da assinatura existente (se houver) para listar histórico
  useEffect(() => {
    if (!open || !companyId) return;
    (async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('asaas_customer_id')
        .eq('company_id', companyId)
        .not('asaas_customer_id', 'is', null)
        .limit(1)
        .maybeSingle();
      if (data?.asaas_customer_id) setAsaasCustomerId(data.asaas_customer_id);
    })();
  }, [open, companyId]);

  const loadHistory = useCallback(async () => {
    if (!asaasCustomerId) { setHistory([]); return; }
    setHistoryLoading(true);
    try {
      const r = await callAsaas<{ data: AsaasPayment[] }>('listPayments', {
        customer: asaasCustomerId,
        billingType: 'PIX',
        limit: '10',
      });
      setHistory(r?.data || []);
    } catch (e: any) {
      toast.error('Falha ao carregar histórico Pix', { description: e?.message });
    } finally {
      setHistoryLoading(false);
    }
  }, [asaasCustomerId]);

  useEffect(() => {
    if (open && asaasCustomerId) loadHistory();
  }, [open, asaasCustomerId, loadHistory]);

  useEffect(() => {
    if (open && plan) {
      trackEvent('begin_checkout', {
        value: cycle === 'yearly' ? plan.yearly_price : plan.monthly_price,
        currency: 'BRL',
        content_name: plan.name,
        content_type: 'subscription',
        billing_cycle: cycle,
      });
    }
    if (!open) {
      setPix({ phase: 'idle' });
      setShowHistory(false);
      paidNotifiedRef.current = false;
    }
  }, [open, plan, cycle]);

  const amount = useMemo(() => {
    if (!plan) return 0;
    return cycle === 'yearly' ? plan.yearly_price : plan.monthly_price;
  }, [plan, cycle]);

  const fetchAndShowQr = useCallback(async (paymentId: string, fallbackValue?: number) => {
    paidNotifiedRef.current = false;
    setPix({ phase: 'loading', message: 'Carregando QR Code…' });
    try {
      const r = await callAsaas<{ encodedImage: string; payload: string; expirationDate?: string }>(
        'getPixQrCode',
        { id: paymentId },
      );
      const expiresAt = r.expirationDate ? new Date(r.expirationDate).getTime() : Date.now() + PIX_VALIDITY_MS;
      setPix({
        phase: 'ready',
        payment_id: paymentId,
        qr: r.encodedImage,
        payload: r.payload,
        expiresAt,
        value: fallbackValue,
      });
    } catch (e: any) {
      setPix({ phase: 'error', message: e?.message || 'Falha ao carregar QR Code' });
    }
  }, []);

  const handleSubmit = async () => {
    if (!plan || !companyId) return;
    if (!holder.name || !holder.email || !holder.cpfCnpj) {
      toast.error('Preencha os dados do titular');
      return;
    }
    if (billingType === 'CREDIT_CARD') {
      if (!card.number || !card.expiryMonth || !card.expiryYear || !card.ccv) {
        toast.error('Preencha os dados do cartão');
        return;
      }
    }

    // Para PIX, mostra a área do QR imediatamente com spinner (UX percepção de velocidade)
    if (billingType === 'PIX') {
      setPix({ phase: 'loading', message: 'Criando assinatura…' });
    }

    try {
      const args = {
        planId: plan.id,
        planName: plan.name,
        amount,
        cycle: (cycle === 'yearly' ? 'YEARLY' : 'MONTHLY') as 'YEARLY' | 'MONTHLY',
        billingType,
        customer: {
          name: holder.name,
          email: holder.email,
          cpfCnpj: holder.cpfCnpj,
          phone: holder.phone,
          postalCode: holder.postalCode,
          addressNumber: holder.addressNumber,
        },
        card: billingType === 'CREDIT_CARD' ? {
          holderName: card.holderName || holder.name,
          number: onlyDigits(card.number),
          expiryMonth: card.expiryMonth.padStart(2, '0'),
          expiryYear: card.expiryYear.length === 2 ? `20${card.expiryYear}` : card.expiryYear,
          ccv: card.ccv,
        } : undefined,
        cardHolder: billingType === 'CREDIT_CARD' ? {
          name: holder.name,
          email: holder.email,
          cpfCnpj: onlyDigits(holder.cpfCnpj),
          postalCode: onlyDigits(holder.postalCode),
          addressNumber: holder.addressNumber || '0',
          phone: onlyDigits(holder.phone),
          mobilePhone: onlyDigits(holder.phone),
        } : undefined,
      };

      const sub = await checkout.mutateAsync(args);

      if (billingType === 'CREDIT_CARD') {
        toast.success('Assinatura criada!');
        trackEvent('add_payment_info', { value: amount, currency: 'BRL', payment_type: 'card' });
        onOpenChange(false);
      } else if (billingType === 'BOLETO') {
        toast.success('Boleto gerado! Verifique seu e-mail.');
        trackEvent('add_payment_info', { value: amount, currency: 'BRL', payment_type: 'boleto' });
        onOpenChange(false);
      } else {
        // PIX: localiza pagamento da assinatura e busca QR
        setPix({ phase: 'loading', message: 'Gerando QR Code Pix…' });
        let paymentId: string | null = null;
        for (let attempt = 0; attempt < 8 && !paymentId; attempt++) {
          try {
            const list = await callAsaas<{ data: AsaasPayment[] }>('listPayments', {
              subscription: sub.id,
              limit: '1',
            });
            paymentId = list?.data?.[0]?.id || null;
          } catch (_) {}
          if (!paymentId) await new Promise((r) => setTimeout(r, 800));
        }
        if (!paymentId) {
          setPix({ phase: 'error', message: 'Aguardando confirmação do Asaas. Tente novamente em alguns segundos.' });
          return;
        }
        await fetchAndShowQr(paymentId, amount);
        // Atualiza histórico em background
        loadHistory();
      }
    } catch (e: any) {
      const msg = e?.message || 'Falha no checkout';
      if (billingType === 'PIX') {
        setPix({ phase: 'error', message: msg });
      } else {
        toast.error(msg);
      }
    }
  };

  const copyPayload = () => {
    if (pix.phase === 'ready' && pix.payload) {
      navigator.clipboard.writeText(pix.payload);
      toast.success('Código Pix copiado');
    }
  };

  if (!plan) return null;

  // Tempo restante (30 min) — Asaas retorna expirationDate apenas como data; usamos PIX_VALIDITY_MS a partir do load
  const remaining = pix.phase === 'ready' ? Math.max(0, pix.expiresAt - now) : 0;
  const expired = pix.phase === 'ready' && remaining === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] sm:w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <ShieldCheck className="h-5 w-5 text-[hsl(var(--emerald))]" />
            <span>Assinar {plan.name}</span>
            <Badge
              variant="outline"
              className={
                cycle === 'yearly'
                  ? 'gap-1 bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                  : 'gap-1 bg-primary/10 border-primary/40 text-primary'
              }
            >
              {cycle === 'yearly' ? <CalendarDays className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" />}
              Cobrança {cycle === 'yearly' ? 'Anual' : 'Mensal'}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Total: <strong>{formatBRL(amount)}</strong>{cycle === 'yearly' ? ' / ano' : ' / mês'} · pagamento processado pelo Asaas com criptografia.
          </DialogDescription>
        </DialogHeader>

        {/* Resumo do ciclo */}
        <Card className="p-3 border-border/60 bg-card/40">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              {cycle === 'yearly' ? (
                <CalendarDays className="h-4 w-4 text-emerald-400" />
              ) : (
                <RefreshCw className="h-4 w-4 text-primary" />
              )}
              <span className="text-muted-foreground">Ciclo selecionado:</span>
              <strong>{cycle === 'yearly' ? 'Anual (12 meses)' : 'Mensal (renovação a cada 30 dias)'}</strong>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground mr-1">Você pagará agora:</span>
              <strong>{formatBRL(amount)}</strong>
              <span className="text-muted-foreground">{cycle === 'yearly' ? ' / ano' : ' / mês'}</span>
            </div>
          </div>
          {cycle === 'yearly' && plan.monthly_price > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Equivale a {formatBRL(amount / 12)}/mês · pagamento único anual
            </p>
          )}
        </Card>

        {/* === HISTÓRICO PIX === */}
        {showHistory ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowHistory(false)}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <h3 className="font-semibold flex items-center gap-2"><History className="h-4 w-4" /> Histórico Pix</h3>
              </div>
              <Button size="sm" variant="outline" onClick={loadHistory} disabled={historyLoading}>
                {historyLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              </Button>
            </div>
            {historyLoading && history.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Nenhuma cobrança Pix encontrada para este cadastro.
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((p) => {
                  const status = STATUS_LABEL[p.status] ?? { label: p.status, tone: 'bg-muted text-muted-foreground border-border' };
                  const created = new Date(p.dateCreated).getTime();
                  const stillValid = p.status === 'PENDING' && Date.now() - created < PIX_VALIDITY_MS;
                  const expiresIn = Math.max(0, PIX_VALIDITY_MS - (Date.now() - created));
                  const isPaid = PAID_STATUSES.has(p.status);
                  const paidAtIso = p.clientPaymentDate || p.confirmedDate || p.paymentDate;
                  return (
                    <Card key={p.id} className={`p-3 flex items-center justify-between gap-3 flex-wrap ${isPaid ? 'border-emerald-500/30 bg-emerald-500/5' : ''}`}>
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isPaid && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                          <span className="font-medium tabular-nums">{formatBRL(p.value)}</span>
                          <Badge variant="outline" className={status.tone}>
                            {isPaid ? 'Pagamento confirmado' : status.label}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {isPaid && paidAtIso ? (
                            <>Confirmado em <strong className="text-foreground">{formatDate(paidAtIso)}</strong> · gerado em {formatDate(p.dateCreated)}</>
                          ) : (
                            <>Criado em {formatDate(p.dateCreated)}{stillValid && <> · expira em {formatRemaining(expiresIn)}</>}</>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isPaid ? (
                          (p.transactionReceiptUrl || p.invoiceUrl) ? (
                            <Button size="sm" variant="outline" asChild>
                              <a href={p.transactionReceiptUrl || p.invoiceUrl} target="_blank" rel="noreferrer">
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-500" /> Ver recibo
                              </a>
                            </Button>
                          ) : (
                            <span className="text-xs text-emerald-500 inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Confirmado
                            </span>
                          )
                        ) : stillValid ? (
                          <Button size="sm" variant="outline" onClick={() => { setShowHistory(false); fetchAndShowQr(p.id, p.value); }}>
                            <QrCode className="h-3.5 w-3.5 mr-1.5" /> Ver QR
                          </Button>
                        ) : p.status === 'PENDING' ? (
                          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> QR expirado
                          </span>
                        ) : p.invoiceUrl ? (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={p.invoiceUrl} target="_blank" rel="noreferrer">Ver fatura</a>
                          </Button>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        ) : pix.phase !== 'idle' ? (
          /* === ÁREA DO QR (loading / ready / error) === */
          <div className="space-y-4 text-center py-2">
            <div className="flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={() => setPix({ phase: 'idle' })}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <h3 className="font-semibold flex items-center gap-2 mx-auto"><QrCode className="h-4 w-4" /> Pague via Pix</h3>
              {asaasCustomerId && (
                <Button size="sm" variant="ghost" onClick={() => setShowHistory(true)}>
                  <History className="h-4 w-4 mr-1" /> Histórico
                </Button>
              )}
            </div>

            <div className="mx-auto w-56 h-56 rounded-lg border border-border bg-white/95 flex items-center justify-center relative overflow-hidden">
              {pix.phase === 'ready' ? (
                <img src={`data:image/png;base64,${pix.qr}`} alt="QR Code Pix" className="w-full h-full p-2" />
              ) : pix.phase === 'paid' ? (
                <div className="text-center p-4 flex flex-col items-center gap-2 text-emerald-500 bg-emerald-500/5">
                  <CheckCircle2 className="h-12 w-12" />
                  <span className="text-sm font-semibold">Pagamento confirmado!</span>
                </div>
              ) : pix.phase === 'error' ? (
                <div className="text-center p-4 text-sm text-rose-500 flex flex-col items-center gap-2">
                  <AlertCircle className="h-6 w-6" />
                  <span>{pix.message}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-xs">{pix.phase === 'loading' ? pix.message : ''}</span>
                </div>
              )}
            </div>

            {pix.phase === 'ready' && (
              <>
                <div className="flex items-center justify-center gap-2 text-xs">
                  <Clock className={expired ? 'h-3.5 w-3.5 text-rose-500' : 'h-3.5 w-3.5 text-primary'} />
                  {expired ? (
                    <span className="text-rose-500 font-medium">QR expirado — gere uma nova cobrança</span>
                  ) : (
                    <span className="text-muted-foreground">
                      Validade: <strong className="tabular-nums text-foreground">{formatRemaining(remaining)}</strong> (30 min)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 max-w-md mx-auto">
                  <Input readOnly value={pix.payload || ''} className="font-mono text-xs" />
                  <Button size="icon" variant="outline" onClick={copyPayload}><Copy className="h-4 w-4" /></Button>
                </div>
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 justify-center">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  Aguardando confirmação automática do pagamento…
                </p>
              </>
            )}

            {pix.phase === 'paid' && (
              <div className="space-y-2">
                <p className="text-sm text-emerald-500 font-medium inline-flex items-center gap-1.5 justify-center">
                  <PartyPopper className="h-4 w-4" /> Sua assinatura foi ativada com sucesso!
                </p>
                <p className="text-xs text-muted-foreground">
                  Você já tem acesso completo ao plano <strong>{plan.name}</strong>.
                </p>
              </div>
            )}

            {pix.phase === 'error' && (
              <Button variant="outline" onClick={() => setPix({ phase: 'idle' })}>Tentar novamente</Button>
            )}

            <Button variant={pix.phase === 'paid' ? 'default' : 'outline'} onClick={() => onOpenChange(false)}>
              {pix.phase === 'paid' ? 'Continuar' : 'Fechar'}
            </Button>
          </div>
        ) : (
          <Tabs value={billingType} onValueChange={(v) => setBillingType(v as 'CREDIT_CARD' | 'PIX' | 'BOLETO')}>
            <TabsList
              className="grid w-full"
              style={{ gridTemplateColumns: `repeat(${enabledMethods.length}, minmax(0, 1fr))` }}
            >
              {enabledMethods.includes('PIX') && (
                <TabsTrigger value="PIX"><QrCode className="h-3.5 w-3.5 mr-1.5" /> Pix</TabsTrigger>
              )}
              {enabledMethods.includes('CREDIT_CARD') && (
                <TabsTrigger value="CREDIT_CARD"><CreditCard className="h-3.5 w-3.5 mr-1.5" /> Cartão</TabsTrigger>
              )}
              {enabledMethods.includes('BOLETO') && (
                <TabsTrigger value="BOLETO"><CreditCard className="h-3.5 w-3.5 mr-1.5" /> Boleto</TabsTrigger>
              )}
            </TabsList>

            {enabledMethods.includes('CREDIT_CARD') && (
              <TabsContent value="CREDIT_CARD" className="space-y-4 pt-4">
                <Card className="p-3 space-y-3">
                  <h4 className="text-sm font-medium">Titular</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Label>Nome completo</Label><Input value={holder.name} onChange={(e) => setHolder({ ...holder, name: e.target.value })} /></div>
                    <div><Label>E-mail</Label><Input type="email" value={holder.email} onChange={(e) => setHolder({ ...holder, email: e.target.value })} /></div>
                    <div><Label>CPF/CNPJ</Label><Input value={holder.cpfCnpj} onChange={(e) => setHolder({ ...holder, cpfCnpj: e.target.value })} /></div>
                    <div><Label>Telefone</Label><Input value={holder.phone} onChange={(e) => setHolder({ ...holder, phone: e.target.value })} placeholder="(11) 99999-9999" /></div>
                    <div><Label>CEP</Label><Input value={holder.postalCode} onChange={(e) => setHolder({ ...holder, postalCode: e.target.value })} /></div>
                    <div><Label>Número</Label><Input value={holder.addressNumber} onChange={(e) => setHolder({ ...holder, addressNumber: e.target.value })} /></div>
                  </div>
                </Card>

                <Card className="p-3 space-y-3">
                  <h4 className="text-sm font-medium">Cartão</h4>
                  <div className="grid grid-cols-6 gap-3">
                    <div className="col-span-6"><Label>Número</Label><Input value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} placeholder="0000 0000 0000 0000" maxLength={19} autoComplete="cc-number" /></div>
                    <div className="col-span-2"><Label>Mês</Label><Input value={card.expiryMonth} onChange={(e) => setCard({ ...card, expiryMonth: e.target.value })} placeholder="MM" maxLength={2} autoComplete="cc-exp-month" /></div>
                    <div className="col-span-2"><Label>Ano</Label><Input value={card.expiryYear} onChange={(e) => setCard({ ...card, expiryYear: e.target.value })} placeholder="AAAA" maxLength={4} autoComplete="cc-exp-year" /></div>
                    <div className="col-span-2"><Label>CVV</Label><Input value={card.ccv} onChange={(e) => setCard({ ...card, ccv: e.target.value })} placeholder="000" maxLength={4} autoComplete="cc-csc" /></div>
                  </div>
                </Card>
              </TabsContent>
            )}

            {enabledMethods.includes('PIX') && (
              <TabsContent value="PIX" className="space-y-4 pt-4">
                <Card className="p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="text-sm font-medium">Dados de cobrança</h4>
                    {asaasCustomerId && (
                      <Button size="sm" variant="ghost" onClick={() => setShowHistory(true)}>
                        <History className="h-4 w-4 mr-1" /> Ver histórico Pix
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Label>Nome completo</Label><Input value={holder.name} onChange={(e) => setHolder({ ...holder, name: e.target.value })} /></div>
                    <div><Label>E-mail</Label><Input type="email" value={holder.email} onChange={(e) => setHolder({ ...holder, email: e.target.value })} /></div>
                    <div><Label>CPF/CNPJ</Label><Input value={holder.cpfCnpj} onChange={(e) => setHolder({ ...holder, cpfCnpj: e.target.value })} /></div>
                    <div><Label>Telefone</Label><Input value={holder.phone} onChange={(e) => setHolder({ ...holder, phone: e.target.value })} placeholder="(11) 99999-9999" /></div>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-[hsl(var(--emerald))]" /> O QR aparece imediatamente · validade de 30 min · use o histórico para reaproveitar QRs já gerados.
                  </p>
                </Card>
              </TabsContent>
            )}

            {enabledMethods.includes('BOLETO') && (
              <TabsContent value="BOLETO" className="space-y-4 pt-4">
                <Card className="p-3 space-y-3">
                  <h4 className="text-sm font-medium">Dados de cobrança</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2"><Label>Nome completo</Label><Input value={holder.name} onChange={(e) => setHolder({ ...holder, name: e.target.value })} /></div>
                    <div><Label>E-mail</Label><Input type="email" value={holder.email} onChange={(e) => setHolder({ ...holder, email: e.target.value })} /></div>
                    <div><Label>CPF/CNPJ</Label><Input value={holder.cpfCnpj} onChange={(e) => setHolder({ ...holder, cpfCnpj: e.target.value })} /></div>
                    <div><Label>Telefone</Label><Input value={holder.phone} onChange={(e) => setHolder({ ...holder, phone: e.target.value })} placeholder="(11) 99999-9999" /></div>
                  </div>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-[hsl(var(--emerald))]" /> Enviaremos o boleto por e-mail. A assinatura é ativada após a compensação.
                  </p>
                </Card>
              </TabsContent>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={checkout.isPending}>
                {checkout.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {billingType === 'CREDIT_CARD' ? `Pagar ${formatBRL(amount)}` : billingType === 'BOLETO' ? 'Gerar boleto' : 'Gerar Pix'}
              </Button>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
