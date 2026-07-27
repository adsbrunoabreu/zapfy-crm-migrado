import { useState } from 'react';
import { format } from 'date-fns';
import { RotateCw, RefreshCw, X, AlertTriangle, Loader2 } from 'lucide-react';
import { PageShell } from '@/components/layout/PageShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  useWebhookRetryQueue,
  useWebhookRetryStats,
  useRetryNow,
  useCancelRetry,
} from '@/hooks/useWebhookRetryQueue';

const STATUS_OPTS = [
  { value: 'pending', label: 'Pendente' },
  { value: 'dead', label: 'Morto' },
  { value: 'done', label: 'Concluído' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'all', label: 'Todos' },
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  dead: 'bg-red-500/15 text-red-300 border-red-500/30',
  done: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  cancelled: 'bg-muted text-foreground border-border',
};

export default function AdminRetryQueue() {
  const [status, setStatus] = useState('pending');
  const listQ = useWebhookRetryQueue({ status });
  const statsQ = useWebhookRetryStats();
  const retryNow = useRetryNow();
  const cancel = useCancelRetry();

  const stats = statsQ.data ?? {};

  return (
    <PageShell
      icon={<RotateCw className="w-5 h-5" />}
      title="Fila de retries"
      subtitle="Reprocessamento automático de webhooks de mensagens (persistência e status) que falharam."
      actions={
        <Button variant="outline" size="sm" onClick={() => listQ.refetch()} disabled={listQ.isFetching}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${listQ.isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Pendentes" value={stats.pending ?? 0} tone="amber" />
          <StatCard label="Mortos" value={stats.dead ?? 0} tone="red" icon={<AlertTriangle className="w-3.5 h-3.5" />} />
          <StatCard label="Concluídos (24h)" value={stats.done_24h ?? 0} tone="emerald" />
          <StatCard
            label="Mais antigo pendente"
            value={stats.oldest_pending ? format(new Date(stats.oldest_pending), 'dd/MM HH:mm') : '—'}
            tone="zinc"
          />
        </div>

        <div className="flex items-center gap-2">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border border-border rounded-lg overflow-hidden bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Message ID</TableHead>
                <TableHead className="text-center">Tentativas</TableHead>
                <TableHead>Próximo retry</TableHead>
                <TableHead>Último erro</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQ.isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="w-4 h-4 mr-2 inline animate-spin" /> Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!listQ.isLoading && (listQ.data ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum item nesta fila.
                  </TableCell>
                </TableRow>
              )}
              {(listQ.data ?? []).map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="text-xs">
                    <Badge variant="outline" className="text-[10px]">{it.kind}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{it.provider ?? '—'}</TableCell>
                  <TableCell className="text-xs font-mono max-w-[200px] truncate" title={it.message_id ?? ''}>
                    {it.message_id ?? '—'}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    {it.attempts}/{it.max_attempts}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {format(new Date(it.next_attempt_at), 'dd/MM HH:mm:ss')}
                  </TableCell>
                  <TableCell className="text-xs text-red-400 max-w-[280px] truncate" title={it.last_error ?? ''}>
                    {it.last_error ?? '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${STATUS_BADGE[it.status]}`}>
                      {it.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {(it.status === 'pending' || it.status === 'dead') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => retryNow.mutate(it.id)}
                        disabled={retryNow.isPending}
                        title="Tentar agora"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {it.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancel.mutate(it.id)}
                        disabled={cancel.isPending}
                        title="Cancelar"
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  tone = 'zinc',
  icon,
}: {
  label: string;
  value: number | string;
  tone?: 'amber' | 'red' | 'emerald' | 'zinc';
  icon?: React.ReactNode;
}) {
  const cls: Record<string, string> = {
    amber: 'text-amber-400',
    red: 'text-red-400',
    emerald: 'text-emerald-400',
    zinc: 'text-foreground',
  };
  return (
    <div className="border border-border rounded-lg p-3 bg-muted/20">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className={`text-xl font-semibold mt-1 ${cls[tone]}`}>{value}</div>
    </div>
  );
}
