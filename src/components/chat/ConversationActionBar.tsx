import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  MoreVertical,
  ArrowLeft,
  ArrowRightLeft,
  Unlink,
  EyeOff,
  Eye,
  UserCog,
  UserMinus,
  Flag,
  FolderOpen,
  XCircle,
  RotateCcw,
  Ticket as TicketIcon,
  StickyNote,
  Trash2,
  Phone,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  useConversationActiveTicket,
  useCreateTicket,
  useReopenTicket,
  useUpdateTicket,
} from '@/hooks/useAttendanceTickets';
import { useAttendanceSettings } from '@/hooks/useAttendanceSettings';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useInstanceAgents } from '@/hooks/useInstanceAgents';
import { useAuth } from '@/contexts/AuthContext';
import CloseTicketDialog from '@/components/chat/CloseTicketDialog';
import TransferTicketDialog from '@/components/chat/TransferTicketDialog';
import TicketBadge from '@/components/chat/TicketBadge';
import { useInstancesMap } from '@/hooks/useInstances';
import { InstanceDot } from '@/components/chat/InstanceDot';
import type { Conversation } from '@/hooks/useConversations';
import { usePatchConversationLocally } from '@/hooks/useConversations';

function getInitials(name: string | null | undefined): string {
  const clean = (name ?? '').trim();
  if (clean && /\p{L}/u.test(clean)) {
    const parts = clean.split(/\s+/).filter(Boolean);
    const initials = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
    if (initials) return initials.toUpperCase();
  }
  return '';
}

interface Props {
  conversation: Conversation;
  contactPhoto?: string | null;
  onBack: () => void;
  onOpenContact: () => void;
  onOpenNotes?: () => void;
  onOpenTickets?: () => void;
  onMarkRead: () => void;
}

export function ConversationActionBar({
  conversation,
  contactPhoto,
  onBack,
  onOpenContact,
  onOpenNotes,
  onOpenTickets,
  onMarkRead,
}: Props) {
  const { toast } = useToast();
  const { user, isCompanyAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { data: ticket } = useConversationActiveTicket(conversation.id);
  const { data: settings } = useAttendanceSettings();
  const { data: members } = useTeamMembers();
  const { data: instanceAgents } = useInstanceAgents();
  const { getForConversation } = useInstancesMap();
  const inst = getForConversation(conversation);
  const patchConversationLocally = usePatchConversationLocally();

  // Atendentes elegíveis para esta conversa: vinculados à instância da conversa.
  // Se a instância não tem ninguém vinculado (instância "aberta"), permite todos.
  // Admin/master sempre aparecem como atribuíveis.
  const eligibleMembers = (() => {
    const all = (members || []).filter((m) => m.isActive);
    const instId = conversation.instance_id;
    if (!instId) return all;
    const linked = (instanceAgents || []).filter((a) => a.instance_id === instId);
    if (linked.length === 0) return all; // instância aberta
    const allowed = new Set(linked.map((a) => a.user_id));
    return all.filter((m) => allowed.has(m.id) || m.role === 'company_admin' || m.role === 'master');
  })();
  const createTicket = useCreateTicket();
  const updateTicket = useUpdateTicket();
  const reopenTicket = useReopenTicket();

  const [closeOpen, setCloseOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [pendingTicket, setPendingTicket] = useState<typeof ticket | null>(null);
  const [deleteConvOpen, setDeleteConvOpen] = useState(false);
  const [deletingConv, setDeletingConv] = useState(false);

  const handleDeleteConversation = async () => {
    setDeletingConv(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversation.id);
      if (error) throw error;
      toast({ title: 'Conversa excluída' });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      setDeleteConvOpen(false);
      onBack();
    } catch (e: any) {
      toast({ title: 'Erro ao excluir', description: e?.message, variant: 'destructive' });
    } finally {
      setDeletingConv(false);
    }
  };

  const general = (settings?.general || {}) as any;
  const closing = (settings?.closing || {}) as any;
  const ticketsCfg = (settings?.tickets || {}) as any;
  const allowTransfer = general.allow_transfer !== false;
  const allowReopen = closing.allow_reopen !== false;
  const priorities: Array<{ name: string; color: string; enabled: boolean }> =
    ticketsCfg.priorities || [];
  const categories: string[] = ticketsCfg.categories || [];

  const hasUnread = (conversation.unread_count || 0) > 0;
  const isClosedTicket = ticket?.status === 'closed';
  const effectiveTicket = pendingTicket ?? ticket;

  const ensureTicket = async () => {
    if (ticket) return ticket;
    return await createTicket.mutateAsync({
      conversation_id: conversation.id,
      lead_id: conversation.lead_id,
      contact_phone: conversation.phone,
      contact_name: conversation.contact_name,
      assigned_to: user?.id ?? null,
    });
  };

  const handleOpenTransfer = async () => {
    if (!allowTransfer) {
      toast({ title: 'Transferência desabilitada', description: 'Ative em Configurações de atendimento.' });
      return;
    }
    try {
      const t = await ensureTicket();
      setPendingTicket(t);
      setTransferOpen(true);
    } catch { /* tratado em useCreateTicket */ }
  };

  const handleOpenClose = async () => {
    // Se existe ticket ATIVO (não encerrado), abre o diálogo de encerramento
    // para capturar motivo/observação. Tickets são para demandas que merecem
    // registro formal.
    // Se NÃO existe ticket ativo, apenas fecha a conversa direto (sem criar
    // ticket só pra encerrá-lo) — comportamento padrão para conversas comuns.
    if (ticket && ticket.status !== 'closed') {
      setPendingTicket(ticket);
      setCloseOpen(true);
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      patchConversationLocally(conversation.id, { closed_at: nowIso });
      const { error } = await supabase
        .from('conversations')
        .update({ closed_at: nowIso })
        .eq('id', conversation.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa finalizada' });
    } catch (e: any) {
      patchConversationLocally(conversation.id, { closed_at: null });
      toast({ title: 'Erro ao finalizar', description: e?.message, variant: 'destructive' });
    }
  };

  const handleReopenConversation = async () => {
    // Reabre o ticket ativo (se houver) → emite evento `reopened`.
    // Também limpa closed_at da conversa para destravar o input.
    const previousClosedAt = conversation.closed_at;
    try {
      patchConversationLocally(conversation.id, { closed_at: null });
      if (ticket && ticket.status === 'closed') {
        await reopenTicket.mutateAsync(ticket.id);
      }
      const { error } = await supabase
        .from('conversations')
        .update({ closed_at: null })
        .eq('id', conversation.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast({ title: 'Conversa reaberta' });
    } catch (e: any) {
      patchConversationLocally(conversation.id, { closed_at: previousClosedAt });
      toast({ title: 'Erro ao reabrir', description: e?.message, variant: 'destructive' });
    }
  };

  const handleAssign = async (memberId: string | null) => {
    try {
      const t = await ensureTicket();
      updateTicket.mutate({ id: t.id, patch: { assigned_to: memberId as any } });
    } catch { /* */ }
  };

  const handlePriority = async (name: string) => {
    try {
      const t = await ensureTicket();
      updateTicket.mutate({ id: t.id, patch: { priority: name } });
    } catch { /* */ }
  };

  const handleCategory = async (cat: string) => {
    try {
      const t = await ensureTicket();
      updateTicket.mutate({ id: t.id, patch: { category: cat } });
    } catch { /* */ }
  };

  const handleOpenTicket = async () => {
    try {
      await ensureTicket();
      toast({ title: 'Ticket aberto' });
    } catch { /* */ }
  };

  const handleUnlinkLead = async () => {
    if (!conversation.lead_id) {
      toast({ title: 'Sem lead vinculado', description: 'Esta conversa não está vinculada a nenhum lead.' });
      return;
    }
    const { error } = await supabase
      .from('conversations')
      .update({ lead_id: null })
      .eq('id', conversation.id);
    if (error) {
      toast({ title: 'Erro ao desvincular', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    toast({ title: 'Lead desvinculado' });
  };

  const handleHideConversation = async () => {
    const { error } = await supabase
      .from('conversations')
      .update({ is_archived: true })
      .eq('id', conversation.id);
    if (error) {
      toast({ title: 'Erro ao ocultar', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['archived-conversations-count'] });
    toast({ title: 'Conversa ocultada' });
  };

  const handleUnhideConversation = async () => {
    const { error } = await supabase
      .from('conversations')
      .update({ is_archived: false })
      .eq('id', conversation.id);
    if (error) {
      toast({ title: 'Erro ao reexibir', description: error.message, variant: 'destructive' });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
    queryClient.invalidateQueries({ queryKey: ['archived-conversations-count'] });
    toast({ title: 'Conversa reexibida' });
  };

  return (
    <div className="h-14 px-3 border-b border-border/50 bg-card/50 flex items-center gap-2 shrink-0">
      <Button variant="ghost" size="icon" className="lg:hidden shrink-0 w-9 h-9" onClick={onBack}>
        <ArrowLeft className="w-5 h-5" />
      </Button>

      {/* Esquerda: avatar + nome + instância em linha única */}
      <button
        type="button"
        className="flex items-center gap-2 flex-1 min-w-0 text-left rounded-md hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={onOpenContact}
      >
        <Avatar className="w-9 h-9 shrink-0">
          {contactPhoto && <AvatarImage src={contactPhoto} />}
          <AvatarFallback className="bg-primary/15 text-primary border border-primary/30 text-xs font-semibold">
            {getInitials(conversation.contact_name) || <Phone className="w-3.5 h-3.5" />}
          </AvatarFallback>
        </Avatar>
        <h3 className="font-semibold text-sm truncate text-foreground leading-tight min-w-0">
          {conversation.contact_name || conversation.phone}
        </h3>
        {inst && (
          <InstanceDot
            label={inst.display_name || inst.instance_name}
            provider={inst.provider}
          />
        )}
      </button>

      {/* Centro: ticket badge visual */}
      <div className="hidden sm:flex items-center shrink-0">
        <TicketBadge
          conversationId={conversation.id}
          leadId={conversation.lead_id}
          contactName={conversation.contact_name}
          contactPhone={conversation.phone}
          compact
        />
      </div>

      {/* Direita: ações */}
      <div className="flex items-center gap-2 shrink-0">
        {(conversation as any).closed_at ? (
          <button
            type="button"
            onClick={handleReopenConversation}
            className="inline-flex items-center gap-1.5 rounded-md border border-foreground bg-transparent text-foreground px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 hover:bg-secondary"
          >
            <RotateCcw className="w-4 h-4" />
            Reabrir
          </button>
        ) : (
          <button
            type="button"
            onClick={handleOpenClose}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 hover:opacity-90"
          >
            <CheckCircle2 className="w-4 h-4" />
            Finalizar
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mais ações"
              className="w-9 h-9 inline-flex items-center justify-center rounded-md border border-foreground text-foreground transition-all duration-200 hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            sideOffset={8}
            collisionPadding={8}
            className="p-0 w-[min(280px,calc(100vw-16px))] max-h-[min(80vh,calc(100dvh-120px))] overflow-hidden rounded-xl border border-border/80 bg-popover/95 backdrop-blur-sm shadow-lg"
          >
            {/* Header minimal — só identificador do ticket */}
            <div className="px-3.5 py-2.5 border-b border-border/60">
              <div className="flex items-center justify-between gap-2 min-w-0">
                {effectiveTicket?.ticket_code ? (
                  <span className="font-mono text-[11px] tracking-wide text-foreground/90 truncate">
                    {effectiveTicket.ticket_code}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">Sem ticket ativo</span>
                )}
                {ticket && (
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {isClosedTicket ? 'Encerrado' : 'Em atendimento'}
                  </span>
                )}
              </div>
            </div>

            <div className="max-h-[min(70vh,calc(100dvh-180px))] overflow-y-auto p-1.5">
            {(() => {
              const itemCls = 'text-[13px] h-9 px-2.5 gap-2.5 rounded-lg cursor-pointer focus:bg-secondary/70 transition-colors';
              const subTriggerCls = 'text-[13px] h-9 px-2.5 gap-2.5 rounded-lg focus:bg-secondary/70 data-[state=open]:bg-secondary/70 transition-colors';
              const subItemCls = 'text-[13px] h-8 px-2.5 gap-2.5 rounded-md cursor-pointer focus:bg-secondary/70';
              const iconCls = 'w-3.5 h-3.5 shrink-0 text-muted-foreground';
              const dotCls = 'inline-block w-2 h-2 rounded-full shrink-0';
              const sectionLabel = 'px-2.5 pt-2 pb-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/60 font-medium';
              return (
                <>
                  {ticket && !isClosedTicket && (
                    <>
                      <div className={sectionLabel}>Ticket</div>
                      {allowTransfer && (
                        <DropdownMenuItem className={itemCls} onClick={handleOpenTransfer}>
                          <UserCog className={iconCls} />
                          <span className="flex-1 truncate">
                            {ticket.assigned_to ? 'Transferir atendente' : 'Atribuir atendente'}
                          </span>
                        </DropdownMenuItem>
                      )}

                      {/* Prioridade */}
                      {priorities.filter((p) => p.enabled).length > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className={subTriggerCls}>
                            <Flag className={iconCls} />
                            <span className="flex-1 truncate">Prioridade</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent collisionPadding={8} className="w-[min(192px,calc(100vw-32px))] p-1 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-sm shadow-lg">
                            {priorities
                              .filter((p) => p.enabled)
                              .map((p) => {
                                const isCurrent = ticket.priority === p.name;
                                return (
                                  <DropdownMenuItem
                                    key={p.name}
                                    className={subItemCls}
                                    onClick={() => handlePriority(p.name)}
                                  >
                                    <span className={dotCls} style={{ backgroundColor: p.color }} />
                                    <span className="flex-1 truncate">{p.name}</span>
                                    {isCurrent && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                                  </DropdownMenuItem>
                                );
                              })}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}

                      {/* Categoria */}
                      {categories.length > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className={subTriggerCls}>
                            <FolderOpen className={iconCls} />
                            <span className="flex-1 truncate">Categoria</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent collisionPadding={8} className="w-[min(192px,calc(100vw-32px))] p-1 rounded-xl border border-border/80 bg-popover/95 backdrop-blur-sm shadow-lg">
                            {categories.map((c) => {
                              const isCurrent = ticket.category === c;
                              return (
                                <DropdownMenuItem
                                  key={c}
                                  className={subItemCls}
                                  onClick={() => handleCategory(c)}
                                >
                                  <span className="flex-1 truncate">{c}</span>
                                  {isCurrent && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                    </>
                  )}

                  {!ticket && (
                    <DropdownMenuItem
                      className={itemCls}
                      disabled={createTicket.isPending}
                      onClick={handleOpenTicket}
                    >
                      <TicketIcon className={iconCls} />
                      <span className="flex-1 truncate">Abrir ticket</span>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuSeparator className="my-1.5 bg-border/60" />

                  <div className={sectionLabel}>Conversa</div>
                  {conversation.is_archived ? (
                    <DropdownMenuItem className={itemCls} onClick={handleUnhideConversation}>
                      <Eye className={iconCls} />
                      <span className="flex-1 truncate">Reexibir conversa</span>
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem className={itemCls} onClick={handleHideConversation}>
                      <EyeOff className={iconCls} />
                      <span className="flex-1 truncate">Ocultar conversa</span>
                    </DropdownMenuItem>
                  )}

                  {ticket && (
                    <>
                      {isClosedTicket && allowReopen && (
                        <>
                          <DropdownMenuSeparator className="my-1.5 bg-border/60" />
                          <DropdownMenuItem
                            className={itemCls}
                            disabled={reopenTicket.isPending}
                            onClick={() => reopenTicket.mutate(ticket.id)}
                          >
                            <RotateCcw className={iconCls} />
                            <span className="flex-1 truncate">
                              {reopenTicket.isPending ? 'Reabrindo…' : 'Reabrir ticket'}
                            </span>
                          </DropdownMenuItem>
                        </>
                      )}
                      {!isClosedTicket && (
                        <>
                          <DropdownMenuSeparator className="my-1.5 bg-border/60" />
                          <DropdownMenuItem
                            className={`${itemCls} text-destructive focus:text-destructive`}
                            onClick={handleOpenClose}
                          >
                            <XCircle className="w-3.5 h-3.5 shrink-0 text-destructive" />
                            <span className="flex-1 truncate">Encerrar ticket</span>
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}

                  {isCompanyAdmin && (
                    <DropdownMenuItem
                      className={`${itemCls} text-destructive focus:text-destructive`}
                      onSelect={(e) => {
                        e.preventDefault();
                        setDeleteConvOpen(true);
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 shrink-0 text-destructive" />
                      <span className="flex-1 truncate">Excluir conversa</span>
                    </DropdownMenuItem>
                  )}
                </>
              );
            })()}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {effectiveTicket && (
        <CloseTicketDialog
          open={closeOpen}
          onOpenChange={(v) => {
            setCloseOpen(v);
            if (!v) setPendingTicket(null);
          }}
          ticket={effectiveTicket}
        />
      )}

      {effectiveTicket && (
        <TransferTicketDialog
          open={transferOpen}
          onOpenChange={(v) => {
            setTransferOpen(v);
            if (!v) setPendingTicket(null);
          }}
          ticket={effectiveTicket}
          instanceId={conversation.instance_id}
        />
      )}

      <AlertDialog open={deleteConvOpen} onOpenChange={setDeleteConvOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá permanentemente a conversa com{' '}
              <strong>{conversation.contact_name || conversation.phone}</strong> e todas as suas mensagens.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingConv}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteConversation();
              }}
              disabled={deletingConv}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deletingConv ? 'Excluindo…' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ConversationActionBar;
