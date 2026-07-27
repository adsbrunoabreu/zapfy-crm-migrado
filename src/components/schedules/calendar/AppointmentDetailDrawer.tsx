import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  User,
  MapPin,
  Link2,
  Phone,
  MessageSquare,
  Edit,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  CalendarDays,
  PlayCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  useChangeAppointmentStatus,
  useDeleteAppointment,
  type AppointmentWithRefs,
  type AppointmentStatus,
} from '@/hooks/useAppointments';
import { useState } from 'react';
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
import { AppointmentStatusBadge } from '../AppointmentStatusBadge';
import { AgendaChecklist } from '../AgendaChecklist';

interface Props {
  appointment: AppointmentWithRefs | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onEdit: (a: AppointmentWithRefs) => void;
}

// Status labels/colors agora vêm do componente <AppointmentStatusBadge />

export function AppointmentDetailDrawer({ appointment, open, onOpenChange, onEdit }: Props) {
  const changeStatus = useChangeAppointmentStatus();
  const del = useDeleteAppointment();
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!appointment) return null;

  const start = new Date(appointment.start_at);
  const end = new Date(appointment.end_at);

  const setStatus = (status: AppointmentStatus, reason?: string) => {
    changeStatus.mutate({ id: appointment.id, status, cancel_reason: reason });
  };

  const accentColor = appointment.reason?.color || appointment.professional?.color;
  const title = appointment.title || appointment.reason?.name || 'Compromisso';

  const canConfirm = appointment.status === 'scheduled';
  const canStart = ['scheduled', 'confirmed'].includes(appointment.status);
  const canComplete = ['scheduled', 'confirmed', 'in_progress'].includes(appointment.status);
  const canCancel = ['scheduled', 'confirmed'].includes(appointment.status);
  const canNoShow = ['scheduled', 'confirmed'].includes(appointment.status);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl h-[100dvh] overflow-hidden p-0 flex flex-col"
        >
          {/* HEADER */}
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: accentColor ? `${accentColor}22` : 'hsl(var(--primary) / 0.15)',
                }}
              >
                <CalendarDays
                  className="w-5 h-5"
                  style={{ color: accentColor || 'hsl(var(--primary))' }}
                />
              </div>

              <div className="min-w-0 flex-1">
                <SheetTitle className="text-base truncate">{title}</SheetTitle>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <AppointmentStatusBadge status={appointment.status} size="xs" />
                  {appointment.reason && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                      <span
                        className="w-1.5 h-1.5 rounded-full mr-1"
                        style={{ background: appointment.reason.color }}
                      />
                      {appointment.reason.name}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* BODY */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
            <div className="px-5 py-5 space-y-5">
              {/* SECTION: WHEN */}
              <section className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                <Row icon={<Calendar className="w-4 h-4" />} label="Data">
                  {format(start, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </Row>
                <Row icon={<Clock className="w-4 h-4" />} label="Horário">
                  {format(start, 'HH:mm')} – {format(end, 'HH:mm')}
                </Row>
              </section>

              {/* SECTION: WHO */}
              {(appointment.professional || appointment.lead) && (
                <section className="space-y-3">
                  <h4 className="text-sm font-semibold">Pessoas</h4>
                  <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                    {appointment.professional && (
                      <Row icon={<User className="w-4 h-4" />} label="Profissional">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: appointment.professional.color }}
                          />
                          {appointment.professional.name}
                          {appointment.professional.specialty && (
                            <span className="text-muted-foreground">
                              · {appointment.professional.specialty}
                            </span>
                          )}
                        </span>
                      </Row>
                    )}
                    {appointment.lead && (
                      <Row icon={<User className="w-4 h-4" />} label="Lead">
                        {appointment.lead.name}
                        {appointment.lead.phone && (
                          <span className="text-muted-foreground ml-2 inline-flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {appointment.lead.phone}
                          </span>
                        )}
                      </Row>
                    )}
                  </div>
                </section>
              )}

              {/* SECTION: WHERE / LINK */}
              {(appointment.location || appointment.meeting_url) && (
                <section className="space-y-3">
                  <h4 className="text-sm font-semibold">Local</h4>
                  <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                    {appointment.location && (
                      <Row icon={<MapPin className="w-4 h-4" />} label="Endereço">
                        {appointment.location}
                      </Row>
                    )}
                    {appointment.meeting_url && (
                      <Row icon={<Link2 className="w-4 h-4" />} label="Link da reunião">
                        <a
                          href={appointment.meeting_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline break-all"
                        >
                          {appointment.meeting_url}
                        </a>
                      </Row>
                    )}
                  </div>
                </section>
              )}

              {/* SECTION: NOTES */}
              {appointment.notes && (
                <section className="space-y-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
                    Anotações
                  </h4>
                  <div className="rounded-xl border border-border bg-card/40 p-4">
                    <p className="text-sm whitespace-pre-wrap">{appointment.notes}</p>
                  </div>
                </section>
              )}

              {/* SECTION: AGENDA CHECKLIST */}
              {(appointment.agenda_checklist?.length ?? 0) > 0 && (
                <section className="space-y-3">
                  <AgendaChecklist
                    items={appointment.agenda_checklist || []}
                    onChange={() => {}}
                    readOnly
                  />
                </section>
              )}

              {/* SECTION: CANCEL REASON */}
              {appointment.cancel_reason && (
                <section className="space-y-3">
                  <h4 className="text-sm font-semibold text-destructive">
                    Motivo do cancelamento
                  </h4>
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                    <p className="text-sm">{appointment.cancel_reason}</p>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* FOOTER */}
          <div className="border-t border-border bg-background/95 backdrop-blur px-5 py-3 shrink-0 space-y-2">
            {appointment.status === 'in_progress' && (
              <div className="text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1.5">
                Atendimento em curso — edição bloqueada. Apenas Concluir ou Cancelar disponíveis.
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="default"
                className="font-semibold shadow-sm"
                onClick={() => onEdit(appointment)}
                disabled={appointment.status === 'in_progress'}
                title={appointment.status === 'in_progress' ? 'Bloqueado durante atendimento' : undefined}
              >
                <Edit className="w-4 h-4 mr-2" /> Editar
              </Button>
              {canConfirm && (
                <Button
                  size="default"
                  className="font-semibold shadow-sm bg-blue-600 text-white hover:bg-blue-600/90"
                  onClick={() => setStatus('confirmed')}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Confirmar
                </Button>
              )}
              {canStart && (
                <Button
                  size="default"
                  className="font-semibold shadow-sm bg-amber-500 text-white hover:bg-amber-500/90"
                  onClick={() => setStatus('in_progress')}
                >
                  <PlayCircle className="w-4 h-4 mr-2" /> Iniciar
                </Button>
              )}
              {canComplete && (
                <Button
                  size="default"
                  className="font-semibold shadow-sm bg-emerald-600 text-white hover:bg-emerald-600/90"
                  onClick={() => setStatus('completed')}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Concluir
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="outline"
                  size="default"
                  className="font-semibold border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => {
                    const r = window.prompt('Motivo do cancelamento (opcional):') || undefined;
                    setStatus('cancelled', r);
                  }}
                >
                  <XCircle className="w-4 h-4 mr-2" /> Cancelar
                </Button>
              )}
              {canNoShow && (
                <Button
                  variant="outline"
                  size="default"
                  className="font-semibold border-amber-500/40 text-amber-500 hover:bg-amber-500/10 hover:text-amber-500"
                  onClick={() => setStatus('no_show')}
                >
                  <AlertCircle className="w-4 h-4 mr-2" /> Não compareceu
                </Button>
              )}
            </div>
            <Button
              variant="destructive"
              size="default"
              className="w-full font-semibold shadow-sm"
              onClick={() => setConfirmDelete(true)}
              disabled={appointment.status === 'in_progress'}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Excluir agendamento
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir agendamento?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                del.mutate(appointment.id, {
                  onSuccess: () => {
                    setConfirmDelete(false);
                    onOpenChange(false);
                  },
                });
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm">{children}</div>
      </div>
    </div>
  );
}
