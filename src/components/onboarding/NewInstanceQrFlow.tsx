/**
 * NewInstanceQrFlow
 * -----------------
 * Fluxo gerenciado de criação de instância WhatsApp + leitura de QR Code,
 * usando a Evolution Master do sistema (via `evolution-proxy`).
 *
 * O usuário só informa um nome de exibição — não vê URL/API Key.
 * Reutilizado pelo OnboardingWizard.
 */
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, QrCode, RefreshCw, CheckCircle2, MessageCircle } from 'lucide-react';
import { invokeEvolutionProxy } from '@/services/evolutionProxy';

const QR_TIMEOUT_SECONDS = 45;

function normalize(payload: unknown): any {
  if (payload == null) return null;
  if (typeof payload !== 'string') return payload;
  try { return JSON.parse(payload); } catch { return null; }
}
function extractQrCode(payload: unknown): string | null {
  const n = normalize(payload);
  const v = n?.qrcode?.base64 || n?.base64 || n?.qr?.base64 || n?.code;
  if (typeof v !== 'string') return null;
  const c = v.trim().replace(/\s/g, '');
  if (!c) return null;
  return c.startsWith('data:') ? c : `data:image/png;base64,${c}`;
}
function isConnected(payload: unknown): boolean {
  const n = normalize(payload);
  return n?.state === 'open' || n?.instance?.state === 'open';
}

interface Props {
  /** Chamado quando a instância detecta status conectado. */
  onConnected?: () => void;
}

export function NewInstanceQrFlow({ onConnected }: Props) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const companyId = profile?.company_id;

  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(0);
  const instanceNameRef = useRef<string | null>(null);
  const displayNameRef = useRef<string>('');

  const handleCreate = async () => {
    if (!name.trim() || !companyId) return;
    setCreating(true);
    try {
      const companyPrefix = (companyId ?? '').slice(0, 8).toLowerCase();
      const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      const instanceName = `${companyPrefix}_${cleaned}`;
      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-webhook`;

      const result = await invokeEvolutionProxy('createInstance', { instanceName, webhookUrl });

      await (supabase as any).from('whatsapp_instances').insert({
        company_id: companyId,
        instance_name: instanceName,
        display_name: name.trim(),
        status: 'disconnected',
      });

      instanceNameRef.current = instanceName;
      displayNameRef.current = name.trim();
      setQrOpen(true);

      const qr = extractQrCode(result);
      if (qr) {
        setQrCode(qr);
      } else {
        setTimeout(refreshQr, 1200);
      }
    } catch (err: any) {
      toast({
        title: 'Erro ao criar conexão',
        description: err?.message || 'Tente novamente em instantes.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const refreshQr = async () => {
    const inst = instanceNameRef.current;
    if (!inst) return;
    setQrLoading(true);
    setQrCode(null);
    try {
      const result = await invokeEvolutionProxy('connectInstance', { instanceName: inst });
      const qr = extractQrCode(result);
      if (qr) {
        setQrCode(qr);
      } else {
        const state = await invokeEvolutionProxy('connectionState', { instanceName: inst });
        if (isConnected(state)) {
          await markConnected();
        }
      }
    } catch {
      toast({ title: 'Não foi possível atualizar o QR Code.', variant: 'destructive' });
    } finally {
      setQrLoading(false);
    }
  };

  const markConnected = async () => {
    const inst = instanceNameRef.current;
    if (!inst || !companyId) return;
    await (supabase as any)
      .from('whatsapp_instances')
      .update({ status: 'connected' })
      .eq('instance_name', inst)
      .eq('company_id', companyId);
    toast({
      title: 'WhatsApp conectado!',
      description: `"${displayNameRef.current}" foi conectada com sucesso.`,
    });
    setQrOpen(false);
    onConnected?.();
  };

  // Countdown
  useEffect(() => {
    if (!qrCode || !qrOpen) {
      setQrCountdown(0);
      return;
    }
    setQrCountdown(QR_TIMEOUT_SECONDS);
    const id = setInterval(() => {
      setQrCountdown((p) => (p <= 1 ? 0 : p - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [qrCode, qrOpen]);

  // Auto refresh on timeout
  useEffect(() => {
    if (qrCountdown === 0 && qrCode && qrOpen && !qrLoading) {
      refreshQr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrCountdown]);

  // Poll status
  useEffect(() => {
    if (!qrOpen) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      const inst = instanceNameRef.current;
      if (!inst) return;
      try {
        const state = await invokeEvolutionProxy('connectionState', { instanceName: inst });
        if (isConnected(state) && !cancelled) {
          await markConnected();
          return;
        }
      } catch { /* ignore */ }
      if (!cancelled) setTimeout(poll, 5000);
    };
    const t = setTimeout(poll, 5000);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrOpen]);

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <p className="text-sm">
        Dê um nome para identificar esta conexão (ex.: <em>Comercial</em>) e gere o QR Code para escanear no seu WhatsApp.
      </p>
      <div className="space-y-1.5">
        <Label>Nome de exibição</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Comercial, Suporte"
          maxLength={60}
        />
      </div>
      <Button onClick={handleCreate} disabled={creating || !name.trim()}>
        {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <QrCode className="w-4 h-4 mr-2" />}
        Gerar QR Code
      </Button>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              Conectar "{displayNameRef.current}"
            </DialogTitle>
            <DialogDescription>
              No WhatsApp do seu celular, abra <strong>Aparelhos conectados</strong> e escaneie o QR Code abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrLoading && !qrCode && (
              <div className="h-64 w-64 flex items-center justify-center text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            )}
            {qrCode && (
              <>
                <img src={qrCode} alt="QR Code WhatsApp" className="h-64 w-64 rounded-md border border-border" />
                <div className="w-64 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(qrCountdown / QR_TIMEOUT_SECONDS) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Expira em {qrCountdown}s — atualiza automaticamente.
                </p>
              </>
            )}
            {!qrLoading && !qrCode && (
              <p className="text-sm text-muted-foreground">QR Code indisponível. Clique em atualizar.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={refreshQr} disabled={qrLoading}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar QR Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
