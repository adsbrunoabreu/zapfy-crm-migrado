import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QrCode, RefreshCw, Loader2, Clock, Inbox, CheckCircle2 } from 'lucide-react';
import { callAsaas } from '@/hooks/useAsaas';
import { supabase } from '@/integrations/supabase/client';
import { PixPaymentDialog } from './PixPaymentDialog';

const PIX_VALIDITY_MS = 30 * 60 * 1000;
const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED']);

interface AsaasPayment {
  id: string;
  value: number;
  status: string;
  billingType: string;
  dateCreated: string;
  paymentDate?: string;
  clientPaymentDate?: string;
  confirmedDate?: string;
  invoiceUrl?: string;
  transactionReceiptUrl?: string;
}

const formatBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = (iso: string) => {
  try { return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return iso; }
};
const fmtRemaining = (ms: number) => {
  if (ms <= 0) return '00:00';
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

interface Props {
  companyId?: string;
}

export function PixPaymentsCard({ companyId }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const [openId, setOpenId] = useState<string | null>(null);
  const [openMeta, setOpenMeta] = useState<{ amount?: number; createdAt?: string } | null>(null);

  // Tick para atualizar contagens regressivas
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Busca asaas_customer_id da assinatura
  const { data: customerId } = useQuery({
    queryKey: ['asaas-customer-id', companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('asaas_customer_id')
        .eq('company_id', companyId!)
        .not('asaas_customer_id', 'is', null)
        .limit(1)
        .maybeSingle();
      return data?.asaas_customer_id || null;
    },
  });

  // Lista pagamentos Pix (todos para mostrar pendentes + últimos pagos)
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['pix-pending', companyId, customerId],
    enabled: !!customerId,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    queryFn: async () => {
      const r = await callAsaas<{ data: AsaasPayment[] }>('listPayments', {
        customer: customerId!,
        billingType: 'PIX',
        limit: '20',
      });
      return r?.data || [];
    },
  });

  const { pending, recentPaid } = useMemo(() => {
    const all = data || [];
    const pend = all.filter(
      (p) => p.status === 'PENDING' && now - new Date(p.dateCreated).getTime() < PIX_VALIDITY_MS,
    );
    const paid = all.filter((p) => PAID.has(p.status)).slice(0, 3);
    return { pending: pend, recentPaid: paid };
  }, [data, now]);

  if (!customerId) return null;

  return (
    <>
      <Card className="glass-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="space-y-0.5">
            <h3 className="font-semibold flex items-center gap-2">
              <QrCode className="h-4 w-4 text-primary" /> Cobranças Pix
            </h3>
            <p className="text-xs text-muted-foreground">
              Reaproveite um QR já gerado para concluir o pagamento sem criar nova cobrança.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {/* Pendentes */}
        {pending.length === 0 ? (
          <div className="text-sm text-muted-foreground inline-flex items-center gap-2 py-2">
            <Inbox className="h-4 w-4" /> Nenhuma cobrança Pix pendente no momento.
          </div>
        ) : (
          <div className="space-y-2">
            {pending.map((p) => {
              const created = new Date(p.dateCreated).getTime();
              const remaining = Math.max(0, PIX_VALIDITY_MS - (now - created));
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 flex-wrap p-3 rounded-md border border-amber-500/30 bg-amber-500/5"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium tabular-nums">{formatBRL(p.value)}</span>
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                        Aguardando pagamento
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Gerado em {formatDate(p.dateCreated)} · expira em <strong className="tabular-nums text-foreground">{fmtRemaining(remaining)}</strong>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setOpenMeta({ amount: p.value, createdAt: p.dateCreated });
                      setOpenId(p.id);
                    }}
                  >
                    <QrCode className="h-3.5 w-3.5 mr-1.5" /> Pagar agora
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Recentes pagos */}
        {recentPaid.length > 0 && (
          <div className="pt-2 border-t border-border/50 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Últimos confirmados</p>
            {recentPaid.map((p) => {
              const at = p.clientPaymentDate || p.confirmedDate || p.paymentDate;
              return (
                <div key={p.id} className="flex items-center justify-between gap-2 text-xs flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <strong className="tabular-nums">{formatBRL(p.value)}</strong>
                    {at && <span className="text-muted-foreground">em {formatDate(at)}</span>}
                  </span>
                  {(p.transactionReceiptUrl || p.invoiceUrl) && (
                    <a
                      href={p.transactionReceiptUrl || p.invoiceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      Ver recibo
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <PixPaymentDialog
        open={!!openId}
        onOpenChange={(v) => { if (!v) { setOpenId(null); setOpenMeta(null); } }}
        paymentId={openId}
        amount={openMeta?.amount}
        createdAt={openMeta?.createdAt}
      />
    </>
  );
}
