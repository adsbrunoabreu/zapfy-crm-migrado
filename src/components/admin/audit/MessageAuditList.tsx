import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, ArrowDown, ArrowUp, AlertCircle } from 'lucide-react';
import type { AuditMessageRow } from '@/hooks/useMessageAudit';

interface Props {
  rows: AuditMessageRow[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (row: AuditMessageRow) => void;
}

const STATUS_VARIANT: Record<string, string> = {
  read: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  delivered: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  sent: 'bg-muted text-foreground border-border',
  pending: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
  error: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export function MessageAuditList({ rows, loading, selectedId, onSelect }: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Carregando…
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="text-center text-sm text-muted-foreground py-10">
        Nenhuma mensagem encontrada para os filtros atuais.
      </div>
    );
  }

  return (
    <ScrollArea className="h-[calc(100vh-22rem)]">
      <div className="divide-y divide-border">
        {rows.map((r) => {
          const active = r.id === selectedId;
          const statusCls = STATUS_VARIANT[r.status ?? ''] ?? 'bg-muted text-muted-foreground border-border';
          return (
            <button
              key={r.id}
              onClick={() => onSelect(r)}
              className={cn(
                'w-full text-left px-3 py-2.5 hover:bg-muted/40 transition-colors',
                active && 'bg-muted/60'
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {r.from_me ? (
                    <ArrowUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <ArrowDown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">
                    {r.lead_name || r.sender_name || r.remote_jid || '—'}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {format(new Date(r.created_at), 'dd/MM HH:mm:ss')}
                </span>
              </div>
              <div className="text-xs text-muted-foreground truncate mb-1.5">
                {r.content || `[${r.message_type ?? 'mensagem'}]`}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge variant="outline" className={cn('text-[10px] py-0 h-4', statusCls)}>
                  {r.status ?? 'pending'}
                </Badge>
                {r.provider && (
                  <Badge variant="outline" className="text-[10px] py-0 h-4">
                    {r.provider}
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {r.events_count} evento{r.events_count === 1 ? '' : 's'}
                </span>
                {r.sync_error && <AlertCircle className="w-3 h-3 text-red-400" />}
              </div>
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}
