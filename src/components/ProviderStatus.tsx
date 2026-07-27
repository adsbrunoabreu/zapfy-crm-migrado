/**
 * ProviderStatus
 * --------------
 * Badge compacto que exibe o estado de uma instância de WhatsApp e o
 * número de telefone conectado. Faz polling a cada `pollIntervalMs` (default
 * 30s) através de `ProviderService.getProvider(instanceId).getStatus()`.
 *
 * Uso:
 *   <ProviderStatus instanceId={instance.id} />
 */
import { useEffect, useRef, useState } from 'react';
import { ProviderService } from '@/services/providerService';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Loader2, Wifi, WifiOff } from 'lucide-react';
import type { ProviderConnectionStatus, ProviderStatus as ProviderStatusType } from '@/types/providers';

interface ProviderStatusProps {
  instanceId: string;
  /** Intervalo de polling em ms. Default 30000. */
  pollIntervalMs?: number;
  /** Variante compacta (apenas dot + número). */
  compact?: boolean;
  className?: string;
}

const STATUS_COPY: Record<ProviderConnectionStatus, { label: string; tone: string; dot: string }> = {
  connected: { label: 'Conectado', tone: 'text-emerald', dot: 'bg-emerald' },
  connecting: { label: 'Conectando', tone: 'text-amber', dot: 'bg-amber' },
  disconnected: { label: 'Desconectado', tone: 'text-destructive', dot: 'bg-destructive' },
  error: { label: 'Erro', tone: 'text-destructive', dot: 'bg-destructive' },
};

export function ProviderStatus({ instanceId, pollIntervalMs = 30_000, compact, className }: ProviderStatusProps) {
  const [status, setStatus] = useState<ProviderStatusType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    const fetchStatus = async () => {
      try {
        const provider = await ProviderService.getProvider(instanceId);
        const result = await provider.getStatus();
        if (cancelled.current) return;
        setStatus(result);
        setError(null);
      } catch (err) {
        if (cancelled.current) return;
        setError((err as Error)?.message ?? 'erro');
        setStatus((prev) => prev ?? {
          status: 'error',
          phoneNumber: null,
          profileName: null,
          lastCheckedAt: new Date(),
        });
      } finally {
        if (!cancelled.current) setLoading(false);
      }
    };

    fetchStatus();
    const id = window.setInterval(fetchStatus, Math.max(5_000, pollIntervalMs));
    return () => {
      cancelled.current = true;
      window.clearInterval(id);
    };
  }, [instanceId, pollIntervalMs]);

  if (loading && !status) {
    return (
      <span className={cn('inline-flex items-center gap-2 text-xs text-muted-foreground', className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Verificando…
      </span>
    );
  }

  const meta = STATUS_COPY[status?.status ?? 'disconnected'];
  const phone = status?.phoneNumber ? `+${status.phoneNumber.replace(/[^\d]/g, '')}` : null;

  if (compact) {
    return (
      <span className={cn('inline-flex items-center gap-2 text-xs', meta.tone, className)} title={error ?? meta.label}>
        <span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden />
        {phone ?? meta.label}
      </span>
    );
  }

  return (
    <Badge variant="outline" className={cn('inline-flex items-center gap-1.5', className)} title={error ?? undefined}>
      <span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden />
      <span className={cn('font-medium', meta.tone)}>{meta.label}</span>
      {phone && (
        <span className="ml-1 inline-flex items-center gap-1 text-muted-foreground">
          {status?.status === 'connected' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {phone}
        </span>
      )}
    </Badge>
  );
}

export default ProviderStatus;
