import { useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SyncStatus {
  sync_phase: string | null;
  sync_progress: number;
  sync_total: number;
  sync_started_at: string | null;
  sync_finished_at: string | null;
  sync_attempts: number;
  sync_error: string | null;
  product_count: number;
  currency: string | null;
  presentment_currencies: string[] | null;
  status: string;
}

const PHASE_LABEL: Record<string, string> = {
  starting: 'Iniciando…',
  shop_info: 'Lendo informações da loja',
  counting: 'Contando produtos',
  products: 'Sincronizando catálogo',
  webhooks: 'Configurando webhooks',
  done: 'Concluído',
  error: 'Falha na sincronização',
};

interface Props {
  /** When isMaster, calls store-proxy with company_id. */
  companyId?: string;
  isMaster?: boolean;
  /** Auto-trigger initial_sync when status is empty (e.g. just connected). */
  autoStart?: boolean;
  className?: string;
}

export function StoreSyncProgress({ companyId, isMaster, autoStart, className }: Props) {
  const qc = useQueryClient();

  const { data: status, refetch } = useQuery({
    queryKey: ['store-sync-status', companyId ?? 'self'],
    queryFn: async () => {
      const body: Record<string, unknown> = { action: 'sync_status' };
      if (isMaster && companyId) body.company_id = companyId;
      const { data, error } = await supabase.functions.invoke('store-proxy', { body });
      if (error) {
        const ctx = await error.context?.json?.().catch(() => null);
        throw new Error(ctx?.error || error.message);
      }
      return (data as { sync: SyncStatus }).sync;
    },
    refetchInterval: (query) => {
      const s = query.state.data as SyncStatus | undefined;
      const phase = s?.sync_phase ?? '';
      // Poll every 2s while running; stop when done/error/empty
      return phase && phase !== 'done' && phase !== 'error' ? 2000 : false;
    },
    staleTime: 0,
  });

  const startMut = useMutation<unknown, Error, boolean>({
    mutationFn: async (force: boolean) => {
      const body: Record<string, unknown> = { action: 'initial_sync', force };
      if (isMaster && companyId) body.company_id = companyId;
      const { data, error } = await supabase.functions.invoke('store-proxy', { body });
      if (error) {
        const ctx = await error.context?.json?.().catch(() => null);
        throw new Error(ctx?.error || error.message);
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-sync-status'] });
      qc.invalidateQueries({ queryKey: ['store-integration'] });
      qc.invalidateQueries({ queryKey: ['store-products'] });
      qc.invalidateQueries({ queryKey: ['admin-store-integrations'] });
      setTimeout(() => refetch(), 500);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Auto-start if requested and idle
  useEffect(() => {
    if (!autoStart || !status) return;
    const phase = status.sync_phase ?? '';
    if (!phase && status.product_count === 0) startMut.mutate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, status?.sync_phase]);

  if (!status) {
    return (
      <div className={cn('text-xs text-muted-foreground inline-flex items-center gap-2', className)}>
        <Loader2 className="h-3 w-3 animate-spin" /> Carregando status…
      </div>
    );
  }

  const phase = status.sync_phase ?? '';
  const isRunning = !!phase && phase !== 'done' && phase !== 'error';
  const isDone = phase === 'done';
  const isError = phase === 'error';
  const phaseLabel = PHASE_LABEL[phase] ?? (status.product_count > 0 ? 'Pronto' : 'Aguardando início');

  // Compute progress percentage
  let pct = 0;
  if (phase === 'products' && status.sync_total > 0) {
    pct = Math.min(99, Math.round((status.sync_progress / status.sync_total) * 100));
  } else if (phase === 'webhooks') pct = 95;
  else if (phase === 'counting' || phase === 'shop_info' || phase === 'starting') pct = 10;
  else if (isDone) pct = 100;

  return (
    <div className={cn(
      'rounded-md border p-3 space-y-2',
      isError ? 'border-destructive/30 bg-destructive/5'
        : isDone ? 'border-emerald/30 bg-emerald/5'
        : 'border-border bg-card/60',
      className,
    )}>
      <div className="flex items-center gap-2 text-xs">
        {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />}
        {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-emerald" />}
        {isError && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
        <span className="font-medium">Sincronização inicial · {phaseLabel}</span>
        <Badge variant="outline" className="ml-auto text-[10px]">
          tentativa {status.sync_attempts || 0}
        </Badge>
      </div>

      <Progress value={pct} className="h-1.5" />

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {phase === 'products' && status.sync_total > 0
            ? `${status.sync_progress} / ${status.sync_total} variantes`
            : isDone
              ? `${status.product_count} produtos · moeda ${status.currency ?? 'BRL'}`
              : `${status.product_count} produtos sincronizados`}
        </span>
        {status.presentment_currencies && status.presentment_currencies.length > 0 && (
          <span>moedas: {status.presentment_currencies.join(', ')}</span>
        )}
      </div>

      {isError && status.sync_error && (
        <div className="text-[11px] text-destructive break-words">{status.sync_error}</div>
      )}

      <div className="flex gap-2 pt-1">
        {!isRunning && (
          <Button
            size="sm"
            variant={isError ? 'default' : 'outline'}
            disabled={startMut.isPending}
            onClick={() => startMut.mutate(isError)}
          >
            {startMut.isPending ? (
              <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> {isError ? 'Reprocessando…' : 'Iniciando…'}</>
            ) : isError ? (
              <><RefreshCw className="h-3 w-3 mr-2" /> Reprocessar</>
            ) : isDone ? (
              <><RefreshCw className="h-3 w-3 mr-2" /> Resincronizar</>
            ) : (
              <><RefreshCw className="h-3 w-3 mr-2" /> Iniciar sincronização</>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
