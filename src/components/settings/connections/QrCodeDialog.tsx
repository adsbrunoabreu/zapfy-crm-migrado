import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, QrCode, RefreshCw, WifiOff } from 'lucide-react';
import { callProxy, extractQrCode, isInstanceConnected } from './proxyUtils';
import { QR_TIMEOUT_SECONDS, type WhatsAppInstance } from './types';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  instance: WhatsAppInstance | null;
  initialQr?: string | null;
  companyId: string | undefined;
  onRefetch: () => void;
}

export function QrCodeDialog({
  open,
  onOpenChange,
  instance,
  initialQr,
  companyId,
  onRefetch,
}: Props) {
  const { toast } = useToast();
  const [qrCode, setQrCode] = useState<string | null>(initialQr ?? null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(0);

  // Reset/load QR when opening
  useEffect(() => {
    if (!open || !instance) return;
    if (initialQr) {
      setQrCode(initialQr);
      return;
    }
    let cancelled = false;
    (async () => {
      setQrLoading(true);
      setQrCode(null);
      try {
        const result = await callProxy('connectInstance', { instanceName: instance.instance_name });
        if (cancelled) return;
        const qr = extractQrCode(result);
        if (qr) {
          setQrCode(qr);
        } else {
          const state = await callProxy('connectionState', { instanceName: instance.instance_name });
          if (isInstanceConnected(state)) {
            toast({ title: 'Já conectado', description: 'Esta instância já está conectada.' });
            await (supabase as any)
              .from('whatsapp_instances')
              .update({ status: 'connected' })
              .eq('instance_name', instance.instance_name)
              .eq('company_id', companyId);
            onOpenChange(false);
            onRefetch();
          }
        }
      } catch {
        toast({ title: 'Erro', description: 'Não foi possível gerar o QR Code.', variant: 'destructive' });
      } finally {
        if (!cancelled) setQrLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instance?.instance_name, initialQr]);

  // Countdown
  useEffect(() => {
    if (!qrCode || !open) {
      setQrCountdown(0);
      return;
    }
    setQrCountdown(QR_TIMEOUT_SECONDS);
    const interval = setInterval(() => {
      setQrCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [qrCode, open]);

  // Auto-refresh when countdown hits 0
  useEffect(() => {
    if (qrCountdown === 0 && qrCode && open && !qrLoading) {
      handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrCountdown]);

  // Poll connection status
  useEffect(() => {
    if (!open || !instance) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const state = await callProxy('connectionState', { instanceName: instance.instance_name });
        if (isInstanceConnected(state) && !cancelled) {
          await (supabase as any)
            .from('whatsapp_instances')
            .update({ status: 'connected' })
            .eq('instance_name', instance.instance_name)
            .eq('company_id', companyId);
          toast({
            title: 'Conectado!',
            description: `"${instance.display_name}" foi conectada com sucesso.`,
          });
          onOpenChange(false);
          onRefetch();
          return;
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setTimeout(poll, 5000);
    };
    const timer = setTimeout(poll, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instance?.instance_name]);

  const handleRefresh = async () => {
    if (!instance) return;
    setQrLoading(true);
    setQrCode(null);
    try {
      const result = await callProxy('connectInstance', { instanceName: instance.instance_name });
      const qr = extractQrCode(result);
      if (qr) setQrCode(qr);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível atualizar o QR Code.', variant: 'destructive' });
    } finally {
      setQrLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-primary" />
            Conectar WhatsApp
          </DialogTitle>
          <DialogDescription>
            Escaneie o QR Code abaixo com o WhatsApp do seu celular para conectar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center py-6">
          {qrLoading ? (
            <div className="w-64 h-64 flex items-center justify-center rounded-xl border border-border/50 bg-secondary/30">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : qrCode ? (
            <div className="relative">
              <div className="p-4 bg-white rounded-xl shadow-sm">
                <img src={qrCode} alt="QR Code WhatsApp" className="w-56 h-56 object-contain" />
              </div>
              {qrCountdown > 0 && (
                <div className="mt-3 flex items-center justify-center gap-2">
                  <div className="relative w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all duration-1000 ease-linear"
                      style={{ width: `${(qrCountdown / QR_TIMEOUT_SECONDS) * 100}%` }}
                    />
                  </div>
                  <span
                    className={`text-xs font-mono shrink-0 ${
                      qrCountdown <= 10 ? 'text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    {qrCountdown}s
                  </span>
                </div>
              )}
              {qrCountdown === 0 && !qrLoading && (
                <div className="mt-3 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground animate-pulse">Atualizando QR Code...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="w-64 h-64 flex flex-col items-center justify-center rounded-xl border border-border/50 bg-secondary/30 text-center px-4">
              <WifiOff className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">QR Code não disponível. Clique em atualizar.</p>
            </div>
          )}

          <div className="mt-4 text-center">
            <p className="text-xs text-muted-foreground">
              {instance?.display_name && (
                <span className="font-medium text-foreground">{instance.display_name}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Abra o WhatsApp → Dispositivos Conectados → Conectar Dispositivo
            </p>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleRefresh} disabled={qrLoading} className="w-full sm:w-auto">
            <RefreshCw className={`w-4 h-4 mr-2 ${qrLoading ? 'animate-spin' : ''}`} />
            Atualizar QR Code
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
