import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, QrCode, CheckCircle2, AlertCircle, Clock, Copy, PartyPopper } from 'lucide-react';
import { callAsaas } from '@/hooks/useAsaas';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { trackEvent } from '@/lib/tracking';

const PIX_VALIDITY_MS = 30 * 60 * 1000;

const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED']);

function fmtRemaining(ms: number) {
  if (ms <= 0) return '00:00';
  const t = Math.floor(ms / 1000);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  paymentId: string | null;
  amount?: number;
  createdAt?: string;
}

type Phase =
  | { phase: 'loading' }
  | { phase: 'ready'; qr: string; payload: string; expiresAt: number }
  | { phase: 'paid' }
  | { phase: 'error'; message: string };

export function PixPaymentDialog({ open, onOpenChange, paymentId, amount, createdAt }: Props) {
  const { profile } = useAuth();
  const companyId = profile?.company_id || null;
  const qc = useQueryClient();
  const [state, setState] = useState<Phase>({ phase: 'loading' });
  const [now, setNow] = useState(() => Date.now());
  const paidRef = useRef(false);

  // Carrega o QR quando abre
  useEffect(() => {
    if (!open || !paymentId) return;
    paidRef.current = false;
    setState({ phase: 'loading' });
    (async () => {
      try {
        const r = await callAsaas<{ encodedImage: string; payload: string; expirationDate?: string }>(
          'getPixQrCode',
          { id: paymentId },
        );
        const baseTs = createdAt ? new Date(createdAt).getTime() : Date.now();
        const expiresAt = r.expirationDate
          ? new Date(r.expirationDate).getTime()
          : baseTs + PIX_VALIDITY_MS;
        setState({ phase: 'ready', qr: r.encodedImage, payload: r.payload, expiresAt });
      } catch (e: any) {
        setState({ phase: 'error', message: e?.message || 'Falha ao carregar QR Code' });
      }
    })();
  }, [open, paymentId, createdAt]);

  // Tick para countdown
  useEffect(() => {
    if (state.phase !== 'ready') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.phase]);

  // Detecção automática de pagamento confirmado
  useEffect(() => {
    if (!open || !paymentId || state.phase !== 'ready') return;
    let cancelled = false;

    const markPaid = () => {
      if (cancelled || paidRef.current) return;
      paidRef.current = true;
      setState({ phase: 'paid' });
      toast.success('Pagamento confirmado!', { description: 'Sua assinatura foi atualizada.' });
      trackEvent('purchase', { value: amount, currency: 'BRL', payment_type: 'pix', transaction_id: paymentId });
      qc.invalidateQueries({ queryKey: ['trial-status'] });
      qc.invalidateQueries({ queryKey: ['subscription', companyId] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['pix-pending', companyId] });
      setTimeout(() => { if (!cancelled) onOpenChange(false); }, 2500);
    };

    const poll = setInterval(async () => {
      try {
        const r = await callAsaas<{ status: string }>('getPayment', { id: paymentId });
        if (r?.status && PAID.has(r.status)) markPaid();
      } catch (_) {}
    }, 5000);

    const channel = companyId
      ? supabase
          .channel(`pix-dlg-${paymentId}`)
          .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'invoices', filter: `company_id=eq.${companyId}` },
            (p: any) => { if (p?.new?.status === 'paid') markPaid(); })
          .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'companies', filter: `id=eq.${companyId}` },
            (p: any) => { if (p?.new?.plan_status === 'active') markPaid(); })
          .subscribe()
      : null;

    return () => {
      cancelled = true;
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [open, paymentId, state.phase, companyId, qc, amount, onOpenChange]);

  const remaining = state.phase === 'ready' ? Math.max(0, state.expiresAt - now) : 0;
  const expired = state.phase === 'ready' && remaining === 0;

  const copy = () => {
    if (state.phase === 'ready') {
      navigator.clipboard.writeText(state.payload);
      toast.success('Código Pix copiado');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" /> Pagar via Pix
          </DialogTitle>
          <DialogDescription>
            {amount != null && <>Valor: <strong>{amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong> · </>}
            Após o pagamento, sua assinatura é atualizada automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-center py-2">
          <div className="mx-auto w-56 h-56 rounded-lg border border-border bg-white/95 flex items-center justify-center overflow-hidden">
            {state.phase === 'ready' ? (
              <img src={`data:image/png;base64,${state.qr}`} alt="QR Code Pix" className="w-full h-full p-2" />
            ) : state.phase === 'paid' ? (
              <div className="text-center p-4 flex flex-col items-center gap-2 text-emerald-500 bg-emerald-500/5">
                <CheckCircle2 className="h-12 w-12" />
                <span className="text-sm font-semibold">Pagamento confirmado!</span>
              </div>
            ) : state.phase === 'error' ? (
              <div className="text-center p-4 text-sm text-rose-500 flex flex-col items-center gap-2">
                <AlertCircle className="h-6 w-6" />
                <span>{state.message}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-xs">Carregando QR Code…</span>
              </div>
            )}
          </div>

          {state.phase === 'ready' && (
            <>
              <div className="flex items-center justify-center gap-2 text-xs">
                <Clock className={expired ? 'h-3.5 w-3.5 text-rose-500' : 'h-3.5 w-3.5 text-primary'} />
                {expired ? (
                  <span className="text-rose-500 font-medium">QR expirado — gere uma nova cobrança</span>
                ) : (
                  <span className="text-muted-foreground">
                    Validade: <strong className="tabular-nums text-foreground">{fmtRemaining(remaining)}</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={state.payload} className="font-mono text-xs" />
                <Button size="icon" variant="outline" onClick={copy}><Copy className="h-4 w-4" /></Button>
              </div>
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5 justify-center">
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                Aguardando confirmação automática do pagamento…
              </p>
            </>
          )}

          {state.phase === 'paid' && (
            <p className="text-sm text-emerald-500 font-medium inline-flex items-center gap-1.5 justify-center">
              <PartyPopper className="h-4 w-4" /> Sua assinatura foi atualizada com sucesso!
            </p>
          )}

          <Button variant={state.phase === 'paid' ? 'default' : 'outline'} onClick={() => onOpenChange(false)} className="w-full">
            {state.phase === 'paid' ? 'Continuar' : 'Fechar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
