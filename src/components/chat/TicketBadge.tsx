import {
  Ticket as TicketIcon,
  Star,
  FolderOpen,
  Flag,
  User as UserIcon,
  Calendar,
  CheckCircle2,
  RotateCcw,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  useConversationActiveTicket,
  useCreateTicket,
  useTicketRating,
} from '@/hooks/useAttendanceTickets';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';

interface Props {
  conversationId: string;
  leadId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  /** When true (used inside ConversationActionBar), badge is visual-only — no buttons. */
  compact?: boolean;
}

import { getTicketStatusDot, getTicketStatusLabel } from '@/lib/ticketStatus';

const PRIORITY_FALLBACK_COLOR: Record<string, string> = {
  baixa: '#10b981',
  low: '#10b981',
  normal: '#3b82f6',
  media: '#3b82f6',
  média: '#3b82f6',
  medium: '#3b82f6',
  alta: '#f59e0b',
  high: '#f59e0b',
  urgente: '#ef4444',
  urgent: '#ef4444',
};

function priorityColor(priority?: string | null, explicit?: string | null) {
  const key = priority?.trim().toLowerCase();
  if (key && PRIORITY_FALLBACK_COLOR[key]) return PRIORITY_FALLBACK_COLOR[key];
  return explicit || '#3b82f6';
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function TicketBadge({
  conversationId,
  leadId,
  contactName,
  contactPhone,
  compact = false,
}: Props) {
  const { user } = useAuth();
  const { data: ticket, isLoading } = useConversationActiveTicket(conversationId);
  const createTicket = useCreateTicket();
  const { data: rating } = useTicketRating(ticket?.id);
  const { data: members = [] } = useTeamMembers();
  const assignee = ticket?.assigned_to ? members.find((m) => m.id === ticket.assigned_to) : null;

  if (isLoading) return null;

  if (!ticket) {
    if (compact) return null;
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5 text-xs"
        disabled={createTicket.isPending}
        onClick={() =>
          createTicket.mutate({
            conversation_id: conversationId,
            lead_id: leadId ?? null,
            contact_name: contactName ?? null,
            contact_phone: contactPhone ?? null,
            assigned_to: user?.id ?? null,
          })
        }
      >
        <TicketIcon className="w-3.5 h-3.5" />
        Abrir ticket
      </Button>
    );
  }

  const ratingLabel =
    rating?.status === 'responded'
      ? `${rating.score}${rating.scale === 'nps' ? '/10' : '/5'}`
      : rating?.status === 'pending'
        ? '...'
        : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 h-8 px-2.5 rounded-full border border-border bg-background/60 hover:bg-secondary/60 transition-colors text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {ticket.priority ? (
            <Flag
              className="w-3.5 h-3.5"
              style={{ color: priorityColor(ticket.priority, ticket.priority_color) }}
            />
          ) : (
            <TicketIcon className="w-3.5 h-3.5 opacity-70" />
          )}
          <span className="font-mono font-medium tracking-tight">
            {ticket.ticket_code}
          </span>
          <span
            className={`w-1.5 h-1.5 rounded-full ${getTicketStatusDot(ticket.status)}`}
            title={getTicketStatusLabel(ticket.status)}
          />
          {rating && (
            <span className="inline-flex items-center gap-1 pl-2 ml-0.5 border-l border-border text-foreground/80">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              {ratingLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="center"
        sideOffset={8}
        className="w-[340px] p-0 overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-md bg-background border border-border flex items-center justify-center shrink-0">
                <TicketIcon className="w-4 h-4 text-foreground/80" />
              </div>
              <div className="min-w-0">
                <div className="font-mono text-sm font-semibold leading-tight truncate">
                  {ticket.ticket_code}
                </div>
                <div className="text-[11px] text-muted-foreground leading-tight">
                  Atendimento
                </div>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-border text-xs">
              <span className={`w-1.5 h-1.5 rounded-full ${getTicketStatusDot(ticket.status)}`} />
              {getTicketStatusLabel(ticket.status)}
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3">
          {ticket.priority && (
            <Row
              icon={<Flag className="w-4 h-4" style={{ color: priorityColor(ticket.priority, ticket.priority_color) }} />}
              label="Prioridade"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: priorityColor(ticket.priority, ticket.priority_color) }}
                  />
                  <span className="capitalize">{ticket.priority}</span>
                </span>
              }
            />
          )}

          {ticket.category && (
            <Row
              icon={<FolderOpen className="w-4 h-4 text-muted-foreground" />}
              label="Categoria"
              value={ticket.category}
            />
          )}

          {ticket.assigned_to && (
            <Row
              icon={<UserIcon className="w-4 h-4 text-muted-foreground" />}
              label="Atribuído"
              value={
                <span className="text-foreground/80 truncate max-w-[180px]">
                  {assignee?.name || 'Atendente'}
                </span>
              }
            />
          )}

          <Row
            icon={<Calendar className="w-4 h-4 text-muted-foreground" />}
            label="Aberto em"
            value={<span className="text-foreground/80">{formatDate(ticket.created_at)}</span>}
          />

          {ticket.reopened_at && (
            <Row
              icon={<RotateCcw className="w-4 h-4 text-amber-500" />}
              label="Reaberto"
              value={<span className="text-foreground/80">{formatDate(ticket.reopened_at)}</span>}
            />
          )}

          {ticket.closed_at && (
            <Row
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              label="Encerrado"
              value={<span className="text-foreground/80">{formatDate(ticket.closed_at)}</span>}
            />
          )}

          {ticket.last_message_at && (
            <Row
              icon={<Clock className="w-4 h-4 text-muted-foreground" />}
              label="Última msg"
              value={<span className="text-foreground/80">{formatDate(ticket.last_message_at)}</span>}
            />
          )}

          {rating && (
            <div className="pt-3 mt-1 border-t border-border">
              <Row
                icon={<Star className="w-4 h-4 fill-amber-400 text-amber-400" />}
                label="Avaliação"
                value={
                  rating.status === 'responded' ? (
                    <span className="font-medium">
                      {rating.score}
                      <span className="text-muted-foreground font-normal">
                        {rating.scale === 'nps' ? ' / 10' : ' / 5'}
                      </span>
                    </span>
                  ) : rating.status === 'pending' ? (
                    <span className="text-muted-foreground">Aguardando resposta</span>
                  ) : (
                    <span className="text-muted-foreground">Expirada</span>
                  )
                }
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-right text-foreground">{value}</div>
    </div>
  );
}
