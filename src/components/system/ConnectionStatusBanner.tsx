/**
 * Banner global de status da conexão Realtime.
 *
 * - "offline" → mostra imediatamente (rede caiu, problema real para o usuário).
 * - "reconnecting" → só mostra após GRACE_MS para evitar flash durante o
 *   subscribe inicial e em reconexões rápidas (token refresh, idle ping).
 */
import { useEffect, useState } from 'react';
import { useRealtime } from '@/contexts/RealtimeContext';
import { Loader2, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

const GRACE_MS = 2500;

export function ConnectionStatusBanner() {
  const { status } = useRealtime();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === 'online') {
      setVisible(false);
      return;
    }
    if (status === 'offline') {
      setVisible(true);
      return;
    }
    const timer = window.setTimeout(() => setVisible(true), GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (!visible || status === 'online') return null;

  const isOffline = status === 'offline';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-none fixed top-4 left-1/2 z-[100] -translate-x-1/2',
        'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold',
        'shadow-lg backdrop-blur-md',
        isOffline
          ? 'border-destructive/40 bg-destructive text-destructive-foreground'
          : 'border-amber-500/50 bg-amber-500 text-black dark:text-zinc-950',
      )}
    >
      {isOffline ? (
        <>
          <WifiOff className="h-4 w-4" />
          <span>Sem conexão</span>
        </>
      ) : (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Reconectando…</span>
        </>
      )}
    </div>
  );
}
