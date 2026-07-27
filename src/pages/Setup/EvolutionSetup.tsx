/**
 * EvolutionSetup
 * --------------
 * Cria uma nova instância na Evolution API Master (configurada nos secrets
 * globais EVOLUTION_MASTER_URL/KEY pelo Master) e abre direto o QR Code.
 *
 * Fluxo:
 *  1. Tenant digita apenas o nome da instância.
 *  2. Insere row em `whatsapp_instances` (dispara trigger de limite de plano).
 *  3. Chama `evolution-proxy.createInstance` — o proxy usa a Master e já
 *     aplica o webhook (todos os eventos) em `…/functions/v1/evolution-webhook`.
 *  4. Mostra QR Code com countdown 45s, polling de status e refresh.
 *  5. Ao detectar `state=open`, marca `connected` e navega para /chat.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Loader2, QrCode, RefreshCw, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { invokeEvolutionProxy } from '@/services/evolutionProxy';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanLimitGuard, parsePlanLimitError } from '@/hooks/usePlanLimitGuard';
import { PlanLimitBanner } from '@/components/billing/PlanLimitBanner';
import { PlanLimitDialog } from '@/components/billing/PlanLimitDialog';

const NameSchema = z
  .string()
  .trim()
  .min(2, 'Nome muito curto')
  .max(60, 'Nome muito longo')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Use apenas letras, números, _ e -');

const QR_TIMEOUT_SECONDS = 45;

function normalizeProxyPayload(payload: unknown): any {
  if (payload == null) return null;
  if (typeof payload !== 'string') return payload;
  try {
    return normalizeProxyPayload(JSON.parse(payload));
  } catch {
    return null;
  }
}

function extractQrCode(payload: unknown): string | null {
  const n = normalizeProxyPayload(payload);
  const v = n?.qrcode?.base64 || n?.base64 || n?.qr?.base64 || n?.code;
  if (typeof v !== 'string') return null;
  const cleaned = v.trim().replace(/\s/g, '');
  if (!cleaned) return null;
  return cleaned.startsWith('data:') ? cleaned : `data:image/png;base64,${cleaned}`;
}

function isConnected(payload: unknown): boolean {
  const n = normalizeProxyPayload(payload);
  return n?.state === 'open' || n?.instance?.state === 'open';
}

export default function EvolutionSetup() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const planGuard = usePlanLimitGuard();

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [planDialogOpen, setPlanDialogOpen] = useState(false);

  // QR state
  const [qrOpen, setQrOpen] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrCountdown, setQrCountdown] = useState(0);
  const [instanceName, setInstanceName] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const cancelledRef = useRef(false);

  const refreshQr = async (target?: string) => {
    const inst = target ?? instanceName;
    if (!inst) return;
    setQrLoading(true);
    setQrCode(null);
    try {
      const result = await invokeEvolutionProxy('connectInstance', { instanceName: inst });
      const qr = extractQrCode(result);
      if (qr) setQrCode(qr);
      else {
        const state = await invokeEvolutionProxy('connectionState', { instanceName: inst });
        if (isConnected(state)) {
          await markConnected(inst);
        }
      }
    } catch (err) {
      toast.error('Não foi possível gerar o QR Code', {
        description: (err as Error)?.message,
      });
    } finally {
      setQrLoading(false);
    }
  };

  const markConnected = async (inst: string) => {
    if (!profile?.company_id) return;
    try {
      await (supabase as any)
        .from('whatsapp_instances')
        .update({ status: 'connected' })
        .eq('instance_name', inst)
        .eq('company_id', profile.company_id);
    } catch { /* noop */ }
    toast.success('WhatsApp conectado com sucesso');
    setQrOpen(false);
    navigate('/chat');
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

  // Auto-refresh quando countdown chega a 0
  useEffect(() => {
    if (qrCountdown === 0 && qrCode && qrOpen && !qrLoading) {
      refreshQr();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrCountdown]);

  // Polling de status
  useEffect(() => {
    if (!qrOpen || !instanceName) return;
    cancelledRef.current = false;
    const poll = async () => {
      if (cancelledRef.current) return;
      try {
        const state = await invokeEvolutionProxy('connectionState', { instanceName });
        if (isConnected(state) && !cancelledRef.current) {
          await markConnected(instanceName);
          return;
        }
      } catch { /* noop */ }
      if (!cancelledRef.current) setTimeout(poll, 5000);
    };
    const t = setTimeout(poll, 5000);
    return () => {
      cancelledRef.current = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrOpen, instanceName]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitError(null);

    const parsed = NameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Nome inválido');
      return;
    }
    if (!profile?.company_id) {
      toast.error('Empresa não identificada na sessão.');
      return;
    }
    if (!planGuard.canAddInstance) {
      setPlanDialogOpen(true);
      return;
    }

    setCreating(true);
    const companyPrefix = profile.company_id.slice(0, 8).toLowerCase();
    const cleaned = parsed.data.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const slug = `${companyPrefix}_${cleaned}`;

    try {
      // 1) INSERT primeiro para acionar trigger de limite de plano antes de criar no Evolution.
      const { error: insertErr } = await (supabase as any)
        .from('whatsapp_instances')
        .insert({
          company_id: profile.company_id,
          provider: 'evolution',
          instance_name: slug,
          display_name: parsed.data,
          status: 'disconnected',
        });

      if (insertErr) {
        const planMsg = parsePlanLimitError(insertErr);
        if (planMsg) {
          setPlanDialogOpen(true);
          return;
        }
        throw new Error(insertErr.message);
      }

      // 2) Cria na Evolution Master (proxy aplica webhook completo).
      const result = await invokeEvolutionProxy('createInstance', { instanceName: slug });

      // 3) Abre QR — usa QR direto da resposta se vier; senão busca via connectInstance.
      setInstanceName(slug);
      setDisplayName(parsed.data);
      setQrOpen(true);

      const qrInline = extractQrCode(result);
      if (qrInline) {
        setQrCode(qrInline);
      } else {
        setTimeout(() => refreshQr(slug), 1200);
      }
    } catch (err) {
      const planMsg = parsePlanLimitError(err);
      if (planMsg) {
        setPlanDialogOpen(true);
      } else {
        const msg = (err as Error)?.message ?? 'Falha ao criar instância';
        setSubmitError(msg);
        toast.error('Falha ao criar instância', { description: msg });
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {!planGuard.canAddInstance && planGuard.instanceBlockedReason && (
          <PlanLimitBanner message={planGuard.instanceBlockedReason} />
        )}
        <PlanLimitDialog
          open={planDialogOpen}
          onOpenChange={setPlanDialogOpen}
          resource="instances"
          message={planGuard.instanceBlockedReason ?? undefined}
        />

        <div className="rounded border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          A conexão é criada automaticamente no servidor Evolution gerenciado, com todos os
          eventos de webhook configurados. Você só precisa escanear o QR Code com o WhatsApp.
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ev-name">Nome da instância</Label>
          <Input
            id="ev-name"
            autoComplete="off"
            spellCheck={false}
            placeholder="ex.: comercial-01"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            aria-invalid={!!error}
            disabled={creating}
            required
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Use apenas letras, números, <code>_</code> e <code>-</code>. O nome interno será
            prefixado automaticamente com o identificador da empresa para evitar colisões.
          </p>
        </div>

        {submitError && (
          <Alert variant="destructive">
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="submit" disabled={creating}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <QrCode className="mr-2 h-4 w-4" />
            Criar e gerar QR Code
          </Button>
        </div>
      </form>

      {/* QR Dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
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
                    <p className="text-xs text-muted-foreground animate-pulse">
                      Atualizando QR Code...
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-64 h-64 flex flex-col items-center justify-center rounded-xl border border-border/50 bg-secondary/30 text-center px-4">
                <WifiOff className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  QR Code não disponível. Clique em atualizar.
                </p>
              </div>
            )}

            <div className="mt-4 text-center">
              {displayName && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{displayName}</span>
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Abra o WhatsApp → Dispositivos Conectados → Conectar Dispositivo
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => refreshQr()}
              disabled={qrLoading}
              className="w-full sm:w-auto"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${qrLoading ? 'animate-spin' : ''}`} />
              Atualizar QR Code
            </Button>
            <Button variant="ghost" onClick={() => setQrOpen(false)} className="w-full sm:w-auto">
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
