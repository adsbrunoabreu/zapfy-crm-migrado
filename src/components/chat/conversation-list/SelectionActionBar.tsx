import { useMemo, useState } from 'react';
import { CheckCheck, Trash2, X, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import BulkCloseTicketsDialog from './BulkCloseTicketsDialog';

interface TicketSummary {
  status: string;
  assigned_to: string | null;
  ticket_id?: string;
}

interface Props {
  selectedIds: Set<string>;
  visibleCount: number;
  allVisibleSelected: boolean;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  onExitSelectionMode: () => void;
  ticketsByConv?: Map<string, any> | null;
  conversationsById?: Map<string, { closed_at: string | null }> | null;
}

const CLOSABLE_TICKET_STATUSES = ['open', 'in_progress', 'reopened', 'awaiting_rating'];

// Concorrência limitada manual.
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  let done = 0;
  const total = items.length;
  const runners = Array.from({ length: Math.min(concurrency, total) }, async () => {
    while (true) {
      const i = next++;
      if (i >= total) return;
      try {
        const value = await worker(items[i], i);
        results[i] = { status: 'fulfilled', value };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
      done++;
      onProgress?.(done, total);
    }
  });
  await Promise.all(runners);
  return results;
}

export function SelectionActionBar({
  selectedIds,
  visibleCount,
  allVisibleSelected,
  onToggleSelectAll,
  onClearSelection,
  onExitSelectionMode,
  ticketsByConv,
  conversationsById,
}: Props) {
  const queryClient = useQueryClient();
  const { isCompanyAdmin } = useAuth();
  const [closeOpen, setCloseOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [markingRead, setMarkingRead] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const count = selectedIds.size;

  // Filtra IDs com ticket ativo encerrável.
  const closableTickets = useMemo(() => {
    if (!ticketsByConv) return [] as Array<{ convId: string; ticketId: string }>;
    const out: Array<{ convId: string; ticketId: string }> = [];
    selectedIds.forEach((convId) => {
      const t = ticketsByConv.get(convId);
      const tid = (t as any)?.ticket_id || (t as any)?.id;
      const status = (t as any)?.status;
      if (tid && status && CLOSABLE_TICKET_STATUSES.includes(status)) {
        out.push({ convId, ticketId: tid });
      }
    });
    return out;
  }, [selectedIds, ticketsByConv]);

  const closableTicketConvIds = useMemo(
    () => new Set(closableTickets.map((t) => t.convId)),
    [closableTickets],
  );

  const closableConversationIds = useMemo(() => {
    if (!conversationsById) return [] as string[];
    const out: string[] = [];
    selectedIds.forEach((convId) => {
      if (closableTicketConvIds.has(convId)) return;
      const conv = conversationsById.get(convId);
      if (conv && !conv.closed_at) out.push(convId);
    });
    return out;
  }, [selectedIds, conversationsById, closableTicketConvIds]);

  const closableCount = closableTickets.length + closableConversationIds.length;

  const handleBulkClose = async (input: { reason: string; notes?: string; skipRating: boolean }) => {
    if (closableCount === 0) {
      toast.warning('Nenhuma conversa selecionada está em atendimento aberto.');
      return;
    }
    setClosing(true);
    setProgress({ done: 0, total: closableCount });
    try {
      let done = 0;
      const updateProgress = () => {
        done += 1;
        setProgress({ done, total: closableCount });
      };

      const results = await runWithConcurrency(
        closableTickets,
        5,
        async ({ ticketId }) => {
          const { error } = await supabase.rpc('close_attendance_ticket', {
            _ticket_id: ticketId,
            _reason: input.reason,
            _notes: input.notes ?? null,
            _skip_rating: !!input.skipRating,
          });
          if (error) throw error;
        },
        updateProgress,
      );

      let conversationOk = 0;
      let conversationFail = 0;
      const closedAt = new Date().toISOString();
      const batchSize = 25;
      for (let i = 0; i < closableConversationIds.length; i += batchSize) {
        const batch = closableConversationIds.slice(i, i + batchSize);
        const { error } = await supabase
          .from('conversations')
          .update({ closed_at: closedAt })
          .in('id', batch)
          .is('closed_at', null);

        if (error) conversationFail += batch.length;
        else conversationOk += batch.length;

        batch.forEach(updateProgress);
      }

      const ticketOk = results.filter((r) => r.status === 'fulfilled').length;
      const ticketFail = results.length - ticketOk;
      const ok = ticketOk + conversationOk;
      const fail = ticketFail + conversationFail;
      const skipped = count - closableCount;

      const parts: string[] = [];
      if (ok > 0) parts.push(`${ok} encerrado${ok !== 1 ? 's' : ''}`);
      if (fail > 0) parts.push(`${fail} falha${fail !== 1 ? 's' : ''}`);
      if (skipped > 0) parts.push(`${skipped} já encerrada${skipped !== 1 ? 's' : ''}`);

      if (fail === 0) toast.success(parts.join(' · '));
      else toast.error(parts.join(' · '));

      queryClient.invalidateQueries({ queryKey: ['attendance-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setCloseOpen(false);
      onExitSelectionMode();
    } finally {
      setClosing(false);
      setProgress(null);
    }
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    setProgress({ done: 0, total: count });
    try {
      const ids = Array.from(selectedIds);
      const batchSize = 25;
      let ok = 0;
      let fail = 0;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error } = await supabase.from('conversations').delete().in('id', batch);
        if (error) {
          fail += batch.length;
        } else {
          ok += batch.length;
        }
        setProgress({ done: Math.min(i + batch.length, ids.length), total: ids.length });
      }
      if (fail === 0) {
        toast.success(`${ok} conversa${ok !== 1 ? 's' : ''} excluída${ok !== 1 ? 's' : ''}`);
      } else {
        toast.error(`${ok} excluída${ok !== 1 ? 's' : ''} · ${fail} falha${fail !== 1 ? 's' : ''}`);
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setDeleteOpen(false);
      onExitSelectionMode();
    } finally {
      setDeleting(false);
      setProgress(null);
    }
  };

  const handleMarkRead = async () => {
    if (count === 0) return;
    setMarkingRead(true);
    try {
      const ids = Array.from(selectedIds);
      const { error } = await supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .in('id', ids);
      if (error) throw error;
      toast.success(`${ids.length} marcada${ids.length !== 1 ? 's' : ''} como lida${ids.length !== 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['unread-conversations-total'] });
      onExitSelectionMode();
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao marcar como lidas');
    } finally {
      setMarkingRead(false);
    }
  };

  return (
    <>
      <div className="h-11 px-3 border-b border-border/50 bg-primary/5 flex items-center gap-2 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={onExitSelectionMode}
          aria-label="Sair do modo seleção"
        >
          <X className="w-4 h-4" />
        </Button>
        <span className="text-xs font-medium text-foreground tabular-nums">
          {count} selecionada{count !== 1 ? 's' : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={onToggleSelectAll}
            disabled={visibleCount === 0}
          >
            {allVisibleSelected ? 'Limpar' : `Selecionar ${visibleCount}`}
          </Button>
        </div>
      </div>

      {count > 0 && (
        <div className="px-3 py-2 border-b border-border/50 bg-card/50 flex flex-col gap-1.5 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              variant="default"
              className="h-8"
              onClick={() => {
                if (closableCount === 0) {
                  toast.warning('Nenhuma conversa selecionada está em atendimento aberto.');
                  return;
                }
                setCloseOpen(true);
              }}
              disabled={closing || deleting || closableCount === 0}
              title={
                closableCount === 0
                  ? 'Nenhuma das conversas selecionadas está em atendimento aberto'
                  : `${closableCount} de ${count} serão encerradas`
              }
            >
              <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
              Encerrar atendimentos
              <span
                className={cn(
                  'ml-1.5 text-[10px] tabular-nums px-1.5 py-0.5 rounded-full leading-none',
                  closableCount === 0
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-primary-foreground/20 text-primary-foreground'
                )}
              >
                {closableCount}/{count}
              </span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={handleMarkRead}
              disabled={markingRead || closing || deleting}
            >
              {markingRead ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5 mr-1.5" />}
              Marcar como lidas
            </Button>
            {isCompanyAdmin ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={closing || deleting}
              >
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Excluir conversas
              </Button>
            ) : (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
                title="Apenas administradores podem excluir conversas"
              >
                <Lock className="w-3 h-3" /> Excluir: somente admin
              </span>
            )}
          </div>
          {closableCount === 0 && (
            <p className="text-[11px] text-destructive/80 leading-snug">
              Nenhuma das {count} conversas selecionadas está em atendimento aberto.
            </p>
          )}
        </div>
      )}

      <BulkCloseTicketsDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        count={closableCount}
        pending={closing}
        progress={progress}
        onConfirm={handleBulkClose}
      />

      <AlertDialog open={deleteOpen} onOpenChange={(v) => !deleting && setDeleteOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {count} conversa{count !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              As conversas selecionadas e todas as suas mensagens serão removidas permanentemente.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleBulkDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting
                ? progress
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Excluindo {progress.done}/{progress.total}…</>
                  : <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Excluindo…</>
                : <><Trash2 className="w-4 h-4 mr-2" /> Excluir</>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
