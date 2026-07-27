import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalIcon,
  List,
  BarChart3,
} from 'lucide-react';
import {
  addMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  isWithinInterval,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useAppointments, useUpsertAppointment, type AppointmentWithRefs, type AppointmentStatus } from '@/hooks/useAppointments';
import { useProfessionals } from '@/hooks/useAppointmentProfessionals';
import { useAppointmentReasons } from '@/hooks/useAppointmentReasons';
import { useWorkdayMask } from '@/hooks/useWorkdayMask';
import { getRangeForPeriod, type DashboardPeriod } from '@/hooks/useDashboardData';

import { FilterPopoverButton } from '@/components/filters/FilterPopoverButton';
import { FilterSelect } from '@/components/filters/FilterSelect';

import { AppointmentDialog } from './AppointmentDialog';
import { AppointmentDetailDrawer } from './AppointmentDetailDrawer';
import { AppointmentsMetricsSheet } from './AppointmentsMetricsSheet';
import { AppointmentStatusBadge } from '../AppointmentStatusBadge';
import { AppointmentHoverPreview } from '../AppointmentHoverPreview';
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';

type ViewMode = 'month' | 'list';

interface CalendarPageProps {
  /** Quando informado, os filtros e ações são renderizados via portal neste elemento (ex.: header da página). */
  actionsPortalTarget?: HTMLElement | null;
}

const STORAGE_KEY = 'schedules.calendar.state.v1';

interface PersistedState {
  view: ViewMode;
  period: DashboardPeriod;
  customRange?: { from: string; to: string };
  proFilter: string;
  reasonFilter: string;
  statusFilter: string;
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PersistedState;
  } catch {}
  return {
    view: 'month',
    period: '30d',
    proFilter: 'all',
    reasonFilter: 'all',
    statusFilter: 'all',
  };
}

export function CalendarPage({ actionsPortalTarget }: CalendarPageProps = {}) {
  const initial = useMemo(loadState, []);
  const qc = useQueryClient();

  const [view, setView] = useState<ViewMode>(initial.view);
  const [period, setPeriod] = useState<DashboardPeriod>(initial.period);
  const [customRange, setCustomRange] = useState<{ from: Date; to: Date } | undefined>(
    initial.customRange ? { from: new Date(initial.customRange.from), to: new Date(initial.customRange.to) } : undefined,
  );
  const [proFilter, setProFilter] = useState<string>(initial.proFilter);
  const [reasonFilter, setReasonFilter] = useState<string>(initial.reasonFilter);
  const [statusFilter, setStatusFilter] = useState<string>(initial.statusFilter);

  const [cursor, setCursor] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AppointmentWithRefs | null>(null);
  const [defaultStart, setDefaultStart] = useState<Date | null>(null);
  const [drawerAppt, setDrawerAppt] = useState<AppointmentWithRefs | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);
  

  // Persistir estado
  useEffect(() => {
    const toSave: PersistedState = {
      view,
      period,
      customRange: customRange ? { from: customRange.from.toISOString(), to: customRange.to.toISOString() } : undefined,
      proFilter,
      reasonFilter,
      statusFilter,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave)); } catch {}
  }, [view, period, customRange, proFilter, reasonFilter, statusFilter]);

  // Range derivado do período
  const range = useMemo(() => getRangeForPeriod(period, customRange), [period, customRange]);

  // Sincroniza cursor: garante que esteja dentro do range
  useEffect(() => {
    if (!isWithinInterval(cursor, { start: range.startDate, end: range.endDate })) {
      setCursor(range.startDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.startDate.getTime(), range.endDate.getTime()]);

  // Para a view Mês, busca a grade (range pode ser maior do que o mês)
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  // Janela efetiva de busca: união do range com o grid quando view=month;
  // na view Lista, mostra o mês inteiro do cursor.
  const listStart = monthStart;
  const listEnd = monthEnd;
  const queryStart = view === 'month'
    ? (gridStart < range.startDate ? gridStart : range.startDate)
    : listStart;
  const queryEnd = view === 'month'
    ? (gridEnd > range.endDate ? gridEnd : range.endDate)
    : listEnd;

  const { data: pros = [] } = useProfessionals();
  const { data: reasons = [] } = useAppointmentReasons();
  const upsertAppt = useUpsertAppointment();
  const { isWorkDay } = useWorkdayMask(pros, proFilter === 'all' ? null : proFilter);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const { data: appts = [], isLoading } = useAppointments(queryStart, queryEnd, {
    professionalId: proFilter === 'all' ? null : proFilter,
    reasonId: reasonFilter === 'all' ? null : reasonFilter,
    status: statusFilter === 'all' ? null : (statusFilter as AppointmentStatus),
  });

  const handleDragEnd = (e: DragEndEvent) => {
    const apptId = String(e.active.id);
    const targetDay = e.over?.id ? String(e.over.id) : null;
    if (!targetDay) return;
    const a = appts.find(x => x.id === apptId);
    if (!a) return;
    const start = new Date(a.start_at);
    const end = new Date(a.end_at);
    const [y, m, d] = targetDay.split('-').map(Number);
    const newStart = new Date(start);
    newStart.setFullYear(y, m - 1, d);
    const durMs = end.getTime() - start.getTime();
    const newEnd = new Date(newStart.getTime() + durMs);
    if (newStart.getTime() === start.getTime()) return;
    upsertAppt.mutate({
      id: a.id,
      professional_id: a.professional_id,
      start_at: newStart.toISOString(),
      end_at: newEnd.toISOString(),
    });
  };

  // Lista mostra o mês inteiro do cursor (alinhado com a view Mês)
  const apptsInRange = useMemo(
    () => appts.filter(a => {
      const d = new Date(a.start_at);
      return d >= listStart && d <= listEnd;
    }),
    [appts, listStart.getTime(), listEnd.getTime()],
  );



  const apptsByDay = useMemo(() => {
    const map = new Map<string, AppointmentWithRefs[]>();
    for (const a of appts) {
      const key = format(new Date(a.start_at), 'yyyy-MM-dd');
      const arr = map.get(key) || [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [appts]);

  const openCreate = (start?: Date) => {
    setEditing(null);
    setDefaultStart(start || null);
    setDialogOpen(true);
  };
  const openEdit = (a: AppointmentWithRefs) => {
    setDrawerAppt(null);
    setEditing(a);
    setDialogOpen(true);
  };

  const activeFilterCount =
    (proFilter !== 'all' ? 1 : 0) +
    (reasonFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0);

  const clearFilters = () => {
    setProFilter('all');
    setReasonFilter('all');
    setStatusFilter('all');
  };


  const headerActions = (
    <div className="flex items-center gap-2 flex-wrap">
      {view === 'month' && (
        <div className="flex items-center border border-border/50 rounded-md overflow-hidden bg-secondary/50 h-9">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-none h-9 text-xs px-3"
            onClick={() => setCursor(new Date())}
          >
            Hoje
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none h-9 w-9 border-l border-border/50"
            onClick={() => setCursor(addMonths(cursor, -1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-none h-9 w-9 border-l border-border/50"
            onClick={() => setCursor(addMonths(cursor, 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <span className="text-xs font-medium px-3 capitalize whitespace-nowrap border-l border-border/50 h-full flex items-center">
            {format(cursor, "MMMM 'de' yyyy", { locale: ptBR })}
          </span>
        </div>
      )}

      <div className="flex border border-border/50 rounded-md overflow-hidden bg-secondary/50 h-9">
        <Button
          variant={view === 'month' ? 'secondary' : 'ghost'}
          size="sm"
          className="rounded-none h-9 text-xs"
          onClick={() => setView('month')}
        >
          <CalIcon className="w-3.5 h-3.5 mr-1" /> Mês
        </Button>
        <Button
          variant={view === 'list' ? 'secondary' : 'ghost'}
          size="sm"
          className="rounded-none h-9 text-xs"
          onClick={() => setView('list')}
        >
          <List className="w-3.5 h-3.5 mr-1" /> Lista
        </Button>
      </div>


      <FilterPopoverButton
        activeCount={activeFilterCount}
        onClear={clearFilters}
        title="Filtros de agendamentos"
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Profissional</Label>
            <FilterSelect
              value={proFilter}
              onValueChange={setProFilter}
              width="w-full"
              placeholder="Profissional"
              options={[
                { value: 'all', label: 'Todos profissionais' },
                ...pros.map(p => ({ value: p.id, label: p.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Motivo</Label>
            <FilterSelect
              value={reasonFilter}
              onValueChange={setReasonFilter}
              width="w-full"
              placeholder="Motivo"
              options={[
                { value: 'all', label: 'Todos motivos' },
                ...reasons.map(r => ({ value: r.id, label: r.name })),
              ]}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <FilterSelect
              value={statusFilter}
              onValueChange={setStatusFilter}
              width="w-full"
              placeholder="Status"
              options={[
                { value: 'all', label: 'Todos status' },
                { value: 'scheduled', label: 'Agendado' },
                { value: 'confirmed', label: 'Confirmado' },
                { value: 'in_progress', label: 'Em andamento' },
                { value: 'completed', label: 'Concluído' },
                { value: 'cancelled', label: 'Cancelado' },
                { value: 'no_show', label: 'Não compareceu' },
              ]}
            />
          </div>
        </div>
      </FilterPopoverButton>

      <Button
        onClick={() => setMetricsOpen(true)}
        variant="outline"
        size="sm"
        className="h-9"
        title="Ver métricas dos agendamentos"
      >
        <BarChart3 className="w-4 h-4 mr-2" /> Métricas
      </Button>

      <Button onClick={() => openCreate()} variant="glow" className="h-9">
        <Plus className="w-4 h-4 mr-2" /> Novo Agendamento
      </Button>

    </div>
  );

  return (
    <div className="space-y-4">
      {actionsPortalTarget ? createPortal(headerActions, actionsPortalTarget) : null}

      {!actionsPortalTarget && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {headerActions}
        </div>
      )}

      {pros.length === 0 && (
        <Card className="p-4 text-sm text-muted-foreground">
          Cadastre profissionais em <span className="font-semibold">Configurações → Agendamentos</span> para começar.
        </Card>
      )}

      {/* Views */}
      {view === 'month' ? (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border/50">
              {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(d => (
                <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 auto-rows-[110px]">
              {days.map((day) => {
                const key = format(day, 'yyyy-MM-dd');
                const dayAppts = apptsByDay.get(key) || [];
                const inMonth = isSameMonth(day, cursor);
                const offWork = !isWorkDay(day);
                return (
                  <DayCell
                    key={key}
                    dayKey={key}
                    inMonth={inMonth}
                    offWork={offWork}
                    isToday={isToday(day)}
                    label={format(day, 'd')}
                    onCreate={() => !offWork && openCreate(new Date(new Date(day).setHours(9, 0, 0, 0)))}
                  >
                    <div className="space-y-0.5">
                      {dayAppts.slice(0, 3).map(a => (
                        <AppointmentHoverPreview key={a.id} appointment={a}>
                          <DraggableAppt appt={a} onClick={() => setDrawerAppt(a)} />
                        </AppointmentHoverPreview>
                      ))}
                      {dayAppts.length > 3 && (
                        <div className="text-[10px] text-muted-foreground px-1.5">+{dayAppts.length - 3} mais</div>
                      )}
                    </div>
                  </DayCell>
                );
              })}
            </div>
          </Card>
        </DndContext>
      ) : (
        <Card className="overflow-hidden">
          {apptsInRange.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              {isLoading ? 'Carregando…' : 'Nenhum compromisso no período.'}
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {apptsInRange.map(a => (
                <AppointmentHoverPreview key={a.id} appointment={a} side="top">
                  <button
                    onClick={() => setDrawerAppt(a)}
                    className="w-full p-4 flex items-center gap-4 hover:bg-secondary/30 transition text-left"
                  >
                    <div className="w-1 self-stretch rounded-full" style={{ background: a.reason?.color || a.professional?.color || '#3b82f6' }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium truncate">{a.title || a.reason?.name || 'Compromisso'}</span>
                        <AppointmentStatusBadge status={a.status} size="xs" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(a.start_at), "dd/MM/yyyy, HH:mm", { locale: ptBR })} – {format(new Date(a.end_at), 'HH:mm')}
                        {a.professional && ` · ${a.professional.name}`}
                        {a.lead && ` · ${a.lead.name}`}
                      </div>
                    </div>
                  </button>
                </AppointmentHoverPreview>
              ))}
            </div>
          )}
        </Card>
      )}

      <AppointmentDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) { setEditing(null); setDefaultStart(null); } }}
        initial={editing}
        defaultStart={defaultStart}
      />
      <AppointmentDetailDrawer
        appointment={drawerAppt}
        open={!!drawerAppt}
        onOpenChange={(v) => { if (!v) setDrawerAppt(null); }}
        onEdit={openEdit}
      />
      <AppointmentsMetricsSheet open={metricsOpen} onOpenChange={setMetricsOpen} />

    </div>
  );
}

/* ------------------------------------------------------------------ */
/* DnD building blocks                                                  */
/* ------------------------------------------------------------------ */

function DayCell({
  dayKey,
  inMonth,
  offWork,
  isToday: today,
  label,
  onCreate,
  children,
}: {
  dayKey: string;
  inMonth: boolean;
  offWork: boolean;
  isToday: boolean;
  label: string;
  onCreate: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey, disabled: offWork });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'border-r border-b border-border/40 p-1.5 cursor-pointer transition overflow-hidden relative',
        !offWork && 'hover:bg-secondary/30',
        !inMonth && 'bg-muted/20 text-muted-foreground/60',
        today && 'bg-primary/5',
        offWork && 'bg-muted/40 cursor-not-allowed',
        isOver && !offWork && 'bg-primary/10 ring-1 ring-primary/40 ring-inset',
      )}
      onClick={onCreate}
      title={offWork ? 'Fora da jornada do profissional selecionado' : undefined}
    >
      <div className={cn('text-xs font-medium mb-1', today && 'text-primary font-bold')}>
        {label}
      </div>
      {children}
    </div>
  );
}

function DraggableAppt({
  appt: a,
  onClick,
}: {
  appt: AppointmentWithRefs;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: a.id });
  const accent = a.reason?.color || a.professional?.color || '#3b82f6';
  return (
    <button
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        if (!isDragging) onClick();
      }}
      className={cn(
        'w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate',
        isDragging && 'opacity-60',
      )}
      style={{
        background: accent + '25',
        color: accent,
        borderLeft: `2px solid ${accent}`,
      }}
      title={`${format(new Date(a.start_at), 'HH:mm')} ${a.title || a.reason?.name || ''}`}
    >
      {format(new Date(a.start_at), 'HH:mm')} {a.title || a.lead?.name || a.reason?.name || 'Compromisso'}
    </button>
  );
}
