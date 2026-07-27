import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Clock, User, ListChecks, FileText, CheckCircle2, PlayCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppointmentStatusBadge } from './AppointmentStatusBadge';
import { useChangeAppointmentStatus, type AppointmentWithRefs, type AppointmentStatus } from '@/hooks/useAppointments';

interface Props {
  appointment: AppointmentWithRefs;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function AppointmentHoverPreview({ appointment: a, children, side = 'right' }: Props) {
  const checklist = a.agenda_checklist || [];
  const done = checklist.filter(i => i.done).length;
  const notesPreview = a.notes ? (a.notes.length > 220 ? a.notes.slice(0, 220) + '…' : a.notes) : null;
  const changeStatus = useChangeAppointmentStatus();

  const setStatus = (e: React.MouseEvent, status: AppointmentStatus, reason?: string) => {
    e.preventDefault();
    e.stopPropagation();
    changeStatus.mutate({ id: a.id, status, cancel_reason: reason });
  };

  const canConfirm = a.status === 'scheduled';
  const canStart = a.status === 'scheduled' || a.status === 'confirmed';
  const canCancel = a.status === 'scheduled' || a.status === 'confirmed';

  return (
    <HoverCard openDelay={250} closeDelay={120}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side={side} sideOffset={8} collisionPadding={16} avoidCollisions className="w-80 p-3 space-y-2.5" align="start">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight truncate">
              {a.title || a.reason?.name || 'Compromisso'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {format(new Date(a.start_at), "dd/MM HH:mm", { locale: ptBR })}
              {' – '}
              {format(new Date(a.end_at), 'HH:mm')}
            </p>
          </div>
          <AppointmentStatusBadge status={a.status} size="xs" />
        </div>

        {a.lead && (
          <div className="text-xs flex items-center gap-1.5 text-muted-foreground">
            <User className="w-3 h-3" />
            <span className="text-foreground truncate">{a.lead.name}</span>
            {a.lead.phone && <span>· {a.lead.phone}</span>}
          </div>
        )}

        {notesPreview && (
          <div className="text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="w-3 h-3" />
              <span className="font-medium text-foreground">Anotações</span>
            </div>
            <p className="whitespace-pre-wrap line-clamp-4">{notesPreview}</p>
          </div>
        )}

        {checklist.length > 0 && (
          <div className="text-xs flex items-center gap-1.5 text-muted-foreground pt-1 border-t border-border">
            <ListChecks className="w-3 h-3" />
            <span>
              Pauta: <span className="text-foreground tabular-nums">{done}/{checklist.length}</span> concluída
            </span>
          </div>
        )}

        {(canConfirm || canStart || canCancel) && (
          <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
            {canConfirm && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={(e) => setStatus(e, 'confirmed')}
                disabled={changeStatus.isPending}
              >
                <CheckCircle2 className="w-3 h-3 mr-1" /> Confirmar
              </Button>
            )}
            {canStart && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={(e) => setStatus(e, 'in_progress')}
                disabled={changeStatus.isPending}
              >
                <PlayCircle className="w-3 h-3 mr-1" /> Iniciar
              </Button>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                onClick={(e) => {
                  const r = window.prompt('Motivo do cancelamento (opcional):') || undefined;
                  setStatus(e, 'cancelled', r);
                }}
                disabled={changeStatus.isPending}
              >
                <XCircle className="w-3 h-3 mr-1" /> Cancelar
              </Button>
            )}
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
