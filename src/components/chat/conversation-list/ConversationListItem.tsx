import { memo, forwardRef, useState } from 'react';
import { Trash2, Loader2, CheckCheck, MailQuestion, ArrowRightLeft } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { ConversationAvatar, formatConversationDate, getInitials } from '../chatHelpers';
// (chip de instância foi movido para o header da conversa)
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useMarkConversationRead } from '@/hooks/useConversations';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { toast } from 'sonner';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Conversation } from '@/hooks/useConversations';
import type { Tag as TagType } from '@/hooks/useTags';

interface TicketSummary {
  status: string;
  assigned_to: string | null;
  assigned_name?: string | null;
}

interface ItemProps {
  conv: Conversation;
  isSelected: boolean;
  onSelect: (c: Conversation) => void;
  tags: TagType[];
  ticket?: TicketSummary | null;
  selectionMode?: boolean;
  isChecked?: boolean;
  onToggleCheck?: (id: string) => void;
}

export const ConversationListItem = memo(forwardRef<HTMLDivElement, ItemProps>(function ConversationListItem(
  { conv, isSelected, onSelect, tags, ticket, selectionMode = false, isChecked = false, onToggleCheck }, ref
) {
  const { isCompanyAdmin } = useAuth();
  const queryClient = useQueryClient();
  const markRead = useMarkConversationRead();
  const { data: teamMembers } = useTeamMembers();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTo, setTransferTo] = useState<string>('');
  const [transferring, setTransferring] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conv.id);
      if (error) throw error;
      toast.success('Conversa excluída');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setConfirmOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao excluir conversa');
    } finally {
      setDeleting(false);
    }
  };

  const handleMarkUnread = async () => {
    // Otimismo: marca 1 não-lida na cache local imediatamente
    queryClient.setQueryData<Conversation[]>(
      ['conversations'],
      (old) => old,
    );
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ unread_count: Math.max(1, conv.unread_count || 1) })
        .eq('id', conv.id);
      if (error) throw error;
      toast.success('Marcada como não lida');
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['unread-conversations-total'] });
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao marcar como não lida');
    }
  };

  const handleTransfer = async () => {
    if (!transferTo) return;
    setTransferring(true);
    try {
      // Busca o ticket mais recente da conversa (ativo se existir)
      const { data: tickets, error: terr } = await supabase
        .from('attendance_tickets')
        .select('id, status')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1);
      if (terr) throw terr;
      const ticketRow = tickets?.[0];
      if (!ticketRow) {
        toast.error('Nenhum atendimento ativo para transferir');
        return;
      }
      const patch: Record<string, any> = {
        assigned_to: transferTo,
        assigned_at: new Date().toISOString(),
      };
      if (ticketRow.status === 'open' || ticketRow.status === 'closed' || ticketRow.status === 'reopened') {
        patch.status = 'in_progress';
      }
      const { error } = await supabase
        .from('attendance_tickets')
        .update(patch)
        .eq('id', ticketRow.id);
      if (error) throw error;
      toast.success('Atendimento transferido');
      queryClient.invalidateQueries({ queryKey: ['attendance-tickets'] });
      queryClient.invalidateQueries({ queryKey: ['conversation-tickets'] });
      setTransferOpen(false);
      setTransferTo('');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao transferir');
    } finally {
      setTransferring(false);
    }
  };

  const handleItemClick = () => {
    if (selectionMode) {
      onToggleCheck?.(conv.id);
    } else {
      onSelect(conv);
    }
  };

  const itemContent = (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={handleItemClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleItemClick();
        }
      }}
      className={cn(
        'group relative w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-all duration-150 cursor-pointer',
        'border border-transparent',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
        selectionMode && isChecked
          ? 'bg-primary/10 border-primary/40'
          : isSelected && !selectionMode
            ? 'bg-primary/10 border-primary/40 shadow-sm'
            : 'hover:bg-accent/60 hover:border-border'
      )}
    >
      {!selectionMode && isSelected && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-primary" />}
      {selectionMode && (
        <div className="flex items-center pt-1.5" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={isChecked}
            onCheckedChange={() => onToggleCheck?.(conv.id)}
            aria-label="Selecionar conversa"
          />
        </div>
      )}
      <ConversationAvatar conv={conv} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className={cn('text-sm truncate', isSelected ? 'font-semibold text-foreground' : 'font-medium')}>
              {conv.contact_name || conv.phone}
            </span>
            {tags.length > 0 && (
              <>
                <span
                  className="shrink-0 max-w-[40%] truncate inline-flex items-center leading-tight rounded-full border font-medium"
                  style={{
                    backgroundColor: `${tags[0].color}20`,
                    borderColor: `${tags[0].color}60`,
                    color: tags[0].color || undefined,
                    fontSize: '0.7rem',
                    padding: '0.1rem 0.4rem',
                  }}
                  title={tags[0].name}
                >
                  {tags[0].name}
                </span>
                {tags.length > 1 && (
                  <span
                    className="shrink-0 text-xs text-muted-foreground"
                    title={tags.slice(1).map((t) => t.name).join(', ')}
                  >
                    +{tags.length - 1}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className={cn('text-xs', isSelected ? 'text-primary' : 'text-muted-foreground')}>
              {formatConversationDate(conv.last_message_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1 gap-2">
          <p className="text-xs text-muted-foreground truncate">{conv.last_message_text || 'Sem mensagens'}</p>
          <div className="flex items-center gap-1 shrink-0">
            {ticket && (() => {
              const dotColor =
                ticket.status === 'in_progress' ? 'bg-emerald-500' :
                ticket.status === 'closed' ? 'bg-muted-foreground/40' :
                'bg-amber-500';
              return (
                <span
                  className="inline-flex items-center gap-1"
                  title={
                    ticket.status === 'in_progress' ? 'Em atendimento' :
                    ticket.status === 'closed' ? 'Encerrado' : 'Aguardando'
                  }
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', dotColor)} />
                  {ticket.assigned_name && (
                    <span
                      className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-secondary text-[10px] font-semibold text-foreground border border-border"
                      title={`Atribuído a ${ticket.assigned_name}`}
                    >
                      {getInitials(ticket.assigned_name)}
                    </span>
                  )}
                </span>
              );
            })()}
            {conv.unread_count > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-none h-[18px] min-w-[18px] px-1.5 border border-primary/40 tabular-nums">
                {conv.unread_count > 99 ? '99+' : conv.unread_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (selectionMode) {
    return itemContent;
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{itemContent}</ContextMenuTrigger>
        <ContextMenuContent>
          {conv.unread_count > 0 ? (
            <ContextMenuItem
              onSelect={(e) => {
                e.preventDefault();
                void markRead(conv.id).then(() => toast.success('Conversa marcada como lida'));
              }}
            >
              <CheckCheck className="w-4 h-4 mr-2" />
              Marcar como lida
            </ContextMenuItem>
          ) : (
            <ContextMenuItem
              onSelect={(e) => {
                e.preventDefault();
                void handleMarkUnread();
              }}
            >
              <MailQuestion className="w-4 h-4 mr-2" />
              Marcar como não lida
            </ContextMenuItem>
          )}
          <ContextMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setTransferTo('');
              setTransferOpen(true);
            }}
          >
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            Transferir
          </ContextMenuItem>
          {isCompanyAdmin && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={(e) => {
                  e.preventDefault();
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Excluir conversa
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {confirmOpen && (
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação removerá permanentemente a conversa com{' '}
                <strong>{conv.contact_name || conv.phone}</strong> e todas as suas mensagens.
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {transferOpen && (
        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogContent onClick={(e) => e.stopPropagation()} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Transferir atendimento</DialogTitle>
              <DialogDescription>
                Escolha o responsável que receberá a conversa com{' '}
                <strong>{conv.contact_name || conv.phone}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um responsável" />
                </SelectTrigger>
                <SelectContent>
                  {(teamMembers || []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={transferring}>
                Cancelar
              </Button>
              <Button onClick={handleTransfer} disabled={!transferTo || transferring}>
                {transferring && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Transferir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}));
