import {
  CheckCircle2,
  RotateCcw,
  PlayCircle,
  Eye,
  UserCog,
  ArrowRightLeft,
  StickyNote,
  Star,
  AlertTriangle,
  MessageSquare,
  Info,
  UserMinus,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TicketEvent } from '@/hooks/useAttendanceTickets';

interface Props {
  event: TicketEvent;
}

const LABEL: Record<string, { text: string; Icon: any }> = {
  opened: { text: 'Atendimento aberto', Icon: PlayCircle },
  created: { text: 'Atendimento criado', Icon: PlayCircle },
  closed: { text: 'Atendimento encerrado', Icon: CheckCircle2 },
  reopened: { text: 'Atendimento reaberto', Icon: RotateCcw },
  assigned: { text: 'Atendente atribuído', Icon: UserCog },
  transferred: { text: 'Conversa transferida', Icon: ArrowRightLeft },
  unassigned: { text: 'Atendente removido', Icon: UserMinus },
  note: { text: 'Nota interna', Icon: StickyNote },
  rating: { text: 'Avaliação registrada', Icon: Star },
  escalated: { text: 'Atendimento escalado', Icon: AlertTriangle },
  responded: { text: 'Resposta enviada', Icon: MessageSquare },
};

function tryParseNotes(notes: string | null): any | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function ChatSystemDivider({ event }: Props) {
  const { text, Icon } = LABEL[event.event_type] ?? { text: event.event_type || 'Evento', Icon: Info };
  const when = format(new Date(event.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  const who = event.actor_name?.trim();
  const parsed = tryParseNotes(event.notes);

  let body: React.ReactNode = null;

  if (parsed && (event.event_type === 'transferred' || event.event_type === 'assigned' || event.event_type === 'unassigned')) {
    const fromName = parsed.from_name as string | null;
    const toName = parsed.to_name as string | null;
    const actorName = (parsed.actor_name as string | null) || who || null;
    const reason = (parsed.reason as string | null) || event.reason || null;

    if (event.event_type === 'transferred' || (event.event_type === 'assigned' && fromName)) {
      body = (
        <>
          Transferido
          {fromName && (
            <>
              {' de '}
              <span className="text-foreground/80 font-medium">{fromName}</span>
            </>
          )}
          {toName && (
            <>
              {' para '}
              <span className="text-foreground/80 font-medium">{toName}</span>
            </>
          )}
          {actorName && (
            <>
              {' por '}
              <span className="text-foreground/80 font-medium">{actorName}</span>
            </>
          )}
        </>
      );
    } else if (event.event_type === 'assigned') {
      body = (
        <>
          Atribuído a <span className="text-foreground/80 font-medium">{toName || '—'}</span>
          {actorName && (
            <>
              {' por '}
              <span className="text-foreground/80 font-medium">{actorName}</span>
            </>
          )}
        </>
      );
    } else {
      body = (
        <>
          Atendente removido
          {fromName && (
            <>
              {' ('}
              <span className="text-foreground/80 font-medium">{fromName}</span>
              {')'}
            </>
          )}
          {actorName && (
            <>
              {' por '}
              <span className="text-foreground/80 font-medium">{actorName}</span>
            </>
          )}
        </>
      );
    }

    return (
      <div className="flex justify-center my-3">
        <div
          className="inline-flex flex-wrap items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground max-w-[90%]"
          title="Visível apenas internamente"
        >
          <Icon className="w-3.5 h-3.5 shrink-0" />
          <span>
            {body}
            {' · '}
            <span className="tabular-nums">{when}</span>
            {reason && (
              <>
                {' · '}
                <span className="italic">{reason}</span>
              </>
            )}
          </span>
          <Eye className="w-3 h-3 opacity-60" aria-label="Interno" />
        </div>
      </div>
    );
  }

  // Fallback: formato legado (notes em texto)
  const target = event.event_type === 'assigned' ? event.notes?.trim() : null;

  return (
    <div className="flex justify-center my-3">
      <div
        className="inline-flex items-center gap-2 rounded-full border border-border/50 bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground"
        title="Visível apenas internamente"
      >
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>
          {text}
          {target ? (
            <>
              : <span className="text-foreground/80 font-medium">{target}</span>
            </>
          ) : null}
          {who ? (
            <>
              {' por '}
              <span className="text-foreground/80 font-medium">{who}</span>
            </>
          ) : null}
          {' · '}
          <span className="tabular-nums">{when}</span>
        </span>
        <Eye className="w-3 h-3 opacity-60" aria-label="Interno" />
      </div>
    </div>
  );
}

export default ChatSystemDivider;
