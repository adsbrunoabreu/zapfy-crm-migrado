import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ExternalLink, Loader2, Ticket } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useContactTicketsHistory } from '@/hooks/useContactTicketsHistory';

const TICKET_STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em atendimento',
  closed: 'Encerrado',
  reopened: 'Reaberto',
  awaiting_rating: 'Aguardando avaliação',
};
const TICKET_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  open: 'secondary',
  in_progress: 'default',
  closed: 'outline',
  reopened: 'secondary',
  awaiting_rating: 'secondary',
};

function fmtDate(d: string | null | undefined) {
  return d ? format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—';
}

function initials(name?: string | null) {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('');
}

interface ContactTicketsTabProps {
  contactId: string | null;
  leadIds: string[];
  phone?: string | null;
}

export function ContactTicketsTab({ contactId, leadIds, phone }: ContactTicketsTabProps) {
  const navigate = useNavigate();
  const { data: tickets, isLoading } = useContactTicketsHistory({ contactId, leadIds, phone });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tickets || tickets.length === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <Ticket className="w-8 h-8 mx-auto text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">Nenhum atendimento registrado para este contato.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-4">
      {tickets.map((t) => (
        <div
          key={t.id}
          className="border border-border rounded-md p-3 hover:bg-card transition-colors space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-xs text-foreground">{t.ticket_code}</span>
              <Badge
                variant={TICKET_STATUS_VARIANT[t.status] || 'outline'}
                className="text-[10px] px-1.5 py-0 h-4"
              >
                {TICKET_STATUS_LABEL[t.status] || t.status}
              </Badge>
              {t.priority && t.priority !== 'normal' && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                  {t.priority}
                </Badge>
              )}
            </div>
            {t.conversation_id && (
              <button
                type="button"
                onClick={() => navigate(`/chat?conversation=${t.conversation_id}`)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                Abrir conversa <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Avatar className="w-5 h-5">
              {t.assigned_avatar && <AvatarImage src={t.assigned_avatar} />}
              <AvatarFallback className="text-[9px]">{initials(t.assigned_name)}</AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground">
              {t.assigned_name || 'Sem atendente'}
            </span>
          </div>

          <div className="text-[11px] text-muted-foreground">
            Aberto em {fmtDate(t.created_at)}
            {t.closed_at && (
              <>
                {' · '}Encerrado em {fmtDate(t.closed_at)}
                {t.close_reason ? ` · ${t.close_reason}` : ''}
              </>
            )}
          </div>
          {t.close_notes && (
            <p className="text-[11px] text-muted-foreground italic border-l-2 border-border pl-2">
              {t.close_notes}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
