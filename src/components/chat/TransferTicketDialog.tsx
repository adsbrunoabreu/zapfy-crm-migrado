import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useInstanceAgents } from '@/hooks/useInstanceAgents';
import {
  useTicketAssignments,
  useTransferTicket,
  type AttendanceTicket,
} from '@/hooks/useAttendanceTickets';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRight, Clock, History, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: AttendanceTicket;
  /** Restringe a lista aos atendentes habilitados nesta instância. */
  instanceId?: string | null;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

export default function TransferTicketDialog({ open, onOpenChange, ticket, instanceId }: Props) {
  const { data: members } = useTeamMembers();
  const { data: instanceAgents } = useInstanceAgents();
  const { data: history } = useTicketAssignments(open ? ticket.id : null);
  const transfer = useTransferTicket();
  const [toUserId, setToUserId] = useState<string>('');
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // Reset ao abrir/fechar
  useEffect(() => {
    if (!open) {
      setToUserId('');
      setReason('');
      setConfirming(false);
      setShowAllHistory(false);
    }
  }, [open]);

  const eligible = useMemo(() => {
    const all = (members || []).filter((m) => m.isActive && m.id !== ticket.assigned_to);
    if (!instanceId) return all;
    const linked = (instanceAgents || []).filter((a) => a.instance_id === instanceId);
    if (linked.length === 0) return all;
    const allowed = new Set(linked.map((a) => a.user_id));
    return all.filter((m) => allowed.has(m.id) || m.role === 'company_admin' || m.role === 'master');
  }, [members, instanceAgents, instanceId, ticket.assigned_to]);

  const memberName = (id: string | null) =>
    id ? members?.find((m) => m.id === id)?.name || 'Usuário' : 'Sem atribuição';

  const isFirstAssign = !ticket.assigned_to;
  const actionLabel = isFirstAssign ? 'Atribuir' : 'Transferir';
  const selectedName = memberName(toUserId || null);
  const currentName = memberName(ticket.assigned_to);

  const sortedHistory = useMemo(() => {
    return (history || []).slice().sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [history]);

  const visibleHistory = showAllHistory ? sortedHistory : sortedHistory.slice(0, 3);
  const hiddenCount = sortedHistory.length - visibleHistory.length;

  // Estatísticas relevantes
  const stats = useMemo(() => {
    if (!sortedHistory.length) return null;
    const totalTransfers = sortedHistory.length;
    const lastEvent = sortedHistory[0];
    const lastWhen = lastEvent
      ? formatDistanceToNow(new Date(lastEvent.created_at), { addSuffix: true, locale: ptBR })
      : null;
    return { totalTransfers, lastWhen };
  }, [sortedHistory]);

  const handleAttempt = () => {
    if (!toUserId) return;
    setConfirming(true);
  };

  const handleConfirm = async () => {
    if (!toUserId) return;
    await transfer.mutateAsync({
      ticket_id: ticket.id,
      to_user_id: toUserId,
      reason: reason.trim() || undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {actionLabel} ticket{' '}
            <span className="font-mono text-sm text-muted-foreground">{ticket.ticket_code}</span>
          </DialogTitle>
          <DialogDescription>
            Atendente atual:{' '}
            <strong className="text-foreground">{currentName}</strong>
            {stats && (
              <span className="ml-2 text-xs text-muted-foreground">
                · {stats.totalTransfers} transferência{stats.totalTransfers === 1 ? '' : 's'}
                {stats.lastWhen && ` · última ${stats.lastWhen}`}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {!confirming ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">{actionLabel} para</Label>
              <Select value={toUserId} onValueChange={setToUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um atendente" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.length === 0 && (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      Nenhum atendente disponível nesta instância.
                    </div>
                  )}
                  {eligible.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Motivo (opcional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex.: cliente solicitou outro atendente"
                rows={3}
              />
            </div>

            {sortedHistory.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5">
                  <History className="w-3 h-3" /> Histórico de atribuições
                </Label>
                <ScrollArea className="max-h-44 border border-border/60 rounded-md p-2">
                  <div className="space-y-2.5">
                    {visibleHistory.map((h) => (
                      <div key={h.id} className="text-xs space-y-1">
                        <div className="flex items-center gap-1.5">
                          <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-[9px] bg-secondary">
                              {getInitials(memberName(h.from_user_id))}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-muted-foreground truncate">
                            {memberName(h.from_user_id)}
                          </span>
                          <ArrowRight className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                          <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-[9px] bg-primary/10 text-primary">
                              {getInitials(memberName(h.to_user_id))}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-foreground font-medium truncate">
                            {memberName(h.to_user_id)}
                          </span>
                          <span className="ml-auto text-muted-foreground/80 shrink-0 inline-flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {format(new Date(h.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                          </span>
                        </div>
                        {h.reason && (
                          <div className="text-muted-foreground italic pl-7">
                            "{h.reason}"
                          </div>
                        )}
                      </div>
                    ))}
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                        onClick={() => setShowAllHistory(true)}
                      >
                        <ChevronDown className="w-3 h-3" /> Ver mais {hiddenCount}
                      </button>
                    )}
                    {showAllHistory && sortedHistory.length > 3 && (
                      <button
                        type="button"
                        className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
                        onClick={() => setShowAllHistory(false)}
                      >
                        <ChevronUp className="w-3 h-3" /> Recolher
                      </button>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/70 bg-secondary/30 p-3.5 space-y-2.5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground/70 font-medium">
                Confirme a {actionLabel.toLowerCase()}
              </div>
              <div className="flex items-center gap-2">
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="text-[10px] bg-secondary">
                    {getInitials(currentName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground truncate">{currentName}</span>
                <ArrowRight className="w-4 h-4 text-muted-foreground/60 mx-1 shrink-0" />
                <Avatar className="w-7 h-7">
                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                    {getInitials(selectedName)}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium text-foreground truncate">{selectedName}</span>
              </div>
              {reason.trim() ? (
                <div className="text-xs text-muted-foreground border-t border-border/60 pt-2 mt-1">
                  <span className="text-foreground/80 font-medium">Motivo: </span>
                  {reason.trim()}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground/70 italic border-t border-border/60 pt-2 mt-1">
                  Nenhum motivo informado
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {confirming ? (
            <>
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                disabled={transfer.isPending}
              >
                Voltar
              </Button>
              <Button onClick={handleConfirm} disabled={transfer.isPending}>
                {transfer.isPending ? `${actionLabel}ndo...` : `Confirmar ${actionLabel.toLowerCase()}`}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleAttempt} disabled={!toUserId}>
                Revisar e {actionLabel.toLowerCase()}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
