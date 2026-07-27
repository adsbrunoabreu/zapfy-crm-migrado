import { useMemo, useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BarChart3, CalendarCheck2, CircleSlash, UserX, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  startOfDay,
  endOfDay,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isWithinInterval,
  format,
  eachDayOfInterval,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useAppointments, type AppointmentStatus, type AppointmentWithRefs } from '@/hooks/useAppointments';
import { AppointmentStatusBadge } from '../AppointmentStatusBadge';
import { cn } from '@/lib/utils';

type Period = 'today' | '7d' | '30d' | 'month';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function getRange(p: Period): { start: Date; end: Date } {
  const now = new Date();
  switch (p) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case '7d':
      return { start: startOfDay(addDays(now, -6)), end: endOfDay(now) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case '30d':
    default:
      return { start: startOfDay(addDays(now, -29)), end: endOfDay(now) };
  }
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  in_progress: 'Em andamento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
};

export function AppointmentsMetricsSheet({ open, onOpenChange }: Props) {
  const [period, setPeriod] = useState<Period>('30d');
  const { start, end } = useMemo(() => getRange(period), [period]);

  const { data: appts = [], isLoading } = useAppointments(start, end);

  const stats = useMemo(() => computeStats(appts), [appts]);
  const upcomingStats = useMemo(
    () => computeUpcoming(appts, start, end),
    [appts, start, end],
  );

  // Drill-down: profissional, motivo ou status selecionado
  const [drill, setDrill] = useState<
    | { type: 'professional' | 'reason'; id: string; name: string; color?: string | null }
    | { type: 'status'; id: AppointmentStatus | 'all'; name: string; color?: string | null }
    | null
  >(null);

  // Reseta drill ao trocar período / fechar
  useEffect(() => {
    setDrill(null);
  }, [period]);
  useEffect(() => {
    if (!open) setDrill(null);
  }, [open]);

  const drillData = useMemo(() => {
    if (!drill) return null;
    const filtered = appts.filter((a) => {
      if (drill.type === 'professional') return a.professional?.id === drill.id;
      if (drill.type === 'reason') return a.reason?.id === drill.id;
      if (drill.type === 'status') return drill.id === 'all' ? true : a.status === drill.id;
      return false;
    });
    // série diária para o gráfico de evolução
    const days = eachDayOfInterval({ start, end });
    const series = days.map((d) => {
      const count = filtered.filter((a) => isSameDay(new Date(a.start_at), d)).length;
      return {
        date: d.toISOString(),
        label: format(d, 'dd/MM', { locale: ptBR }),
        count,
      };
    });
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime(),
    );
    return { items: sorted, series, total: filtered.length };
  }, [drill, appts, start, end]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg h-[100dvh] overflow-hidden p-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            {drill ? (
              <Button
                variant="ghost"
                size="icon"
                className="w-9 h-9 shrink-0"
                onClick={() => setDrill(null)}
                aria-label="Voltar"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            ) : (
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className="min-w-0">
              <SheetTitle className="text-base inline-flex items-center gap-2 truncate">
                {drill?.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: drill.color }}
                  />
                )}
                <span className="truncate">
                  {drill ? drill.name : 'Métricas de agendamentos'}
                </span>
              </SheetTitle>
              <SheetDescription className="text-xs">
                {drill
                  ? drill.type === 'professional'
                    ? 'Agendamentos do profissional no período'
                    : drill.type === 'reason'
                    ? 'Agendamentos deste motivo no período'
                    : 'Agendamentos filtrados por status no período'
                  : 'Visão rápida dos seus compromissos'}
              </SheetDescription>
            </div>
          </div>
          <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)} className="mt-3">
            <TabsList className="grid grid-cols-4 w-full h-8">
              <TabsTrigger value="today" className="text-xs">Hoje</TabsTrigger>
              <TabsTrigger value="7d" className="text-xs">7 dias</TabsTrigger>
              <TabsTrigger value="30d" className="text-xs">30 dias</TabsTrigger>
              <TabsTrigger value="month" className="text-xs">Este mês</TabsTrigger>
            </TabsList>
          </Tabs>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="px-5 py-5 space-y-5">
            {isLoading ? (
              <LoadingSkeleton />
            ) : drill && drillData ? (
              <DrillView data={drillData} />
            ) : appts.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-2 gap-2.5">
                  <Kpi
                    label="Total"
                    value={stats.total}
                    icon={<CalendarCheck2 className="w-3.5 h-3.5" />}
                    onClick={() => setDrill({ type: 'status', id: 'all', name: 'Todos os agendamentos' })}
                  />
                  <Kpi
                    label="Concluídos"
                    value={stats.completed}
                    pct={stats.total ? (stats.completed / stats.total) * 100 : 0}
                    tone="success"
                    onClick={
                      stats.completed > 0
                        ? () => setDrill({ type: 'status', id: 'completed', name: 'Concluídos' })
                        : undefined
                    }
                  />
                  <Kpi
                    label="Cancelados"
                    value={stats.cancelled}
                    pct={stats.total ? (stats.cancelled / stats.total) * 100 : 0}
                    tone="danger"
                    icon={<CircleSlash className="w-3.5 h-3.5" />}
                    onClick={
                      stats.cancelled > 0
                        ? () => setDrill({ type: 'status', id: 'cancelled', name: 'Cancelados' })
                        : undefined
                    }
                  />
                  <Kpi
                    label="Não compareceu"
                    value={stats.no_show}
                    pct={stats.total ? (stats.no_show / stats.total) * 100 : 0}
                    tone="warning"
                    icon={<UserX className="w-3.5 h-3.5" />}
                    onClick={
                      stats.no_show > 0
                        ? () => setDrill({ type: 'status', id: 'no_show', name: 'Não compareceu' })
                        : undefined
                    }
                  />
                </div>

                {/* Taxa de comparecimento */}
                <Card className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Taxa de comparecimento</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {stats.attendanceRate !== null
                        ? `${stats.attendanceRate.toFixed(0)}%`
                        : '—'}
                    </p>
                  </div>
                  <ProgressBar value={stats.attendanceRate ?? 0} tone="success" />
                  <p className="text-[11px] text-muted-foreground">
                    Concluídos / (Concluídos + Cancelados + Não compareceu)
                  </p>
                </Card>

                {/* Próximos */}
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground mb-2">Próximos compromissos</p>
                  <div className="grid grid-cols-3 gap-3">
                    <NextStat label="Hoje" value={upcomingStats.today} />
                    <NextStat label="Amanhã" value={upcomingStats.tomorrow} />
                    <NextStat label="7 dias" value={upcomingStats.week} />
                  </div>
                </Card>

                {/* Top profissionais */}
                {stats.topPros.length > 0 && (
                  <Section title="Top profissionais" icon={<Users className="w-3.5 h-3.5" />}>
                    {stats.topPros.map((p) => (
                      <RankRow
                        key={p.id}
                        name={p.name}
                        color={p.color}
                        value={p.count}
                        max={stats.topPros[0].count}
                        onClick={() =>
                          setDrill({ type: 'professional', id: p.id, name: p.name, color: p.color })
                        }
                      />
                    ))}
                  </Section>
                )}

                {/* Top motivos */}
                {stats.topReasons.length > 0 && (
                  <Section title="Top motivos">
                    {stats.topReasons.map((r) => (
                      <RankRow
                        key={r.id}
                        name={r.name}
                        color={r.color}
                        value={r.count}
                        max={stats.topReasons[0].count}
                        onClick={() =>
                          setDrill({ type: 'reason', id: r.id, name: r.name, color: r.color })
                        }
                      />
                    ))}
                  </Section>
                )}

                {/* Distribuição por status */}
                <Section title="Distribuição por status">
                  {(Object.keys(STATUS_LABEL) as AppointmentStatus[]).map((s) => {
                    const count = stats.byStatus[s] || 0;
                    if (count === 0) return null;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setDrill({ type: 'status', id: s, name: STATUS_LABEL[s] })
                        }
                        className="flex items-center justify-between w-full py-1 -mx-1 px-1 rounded-md hover:bg-accent/50 transition-colors text-left"
                      >
                        <AppointmentStatusBadge status={s} size="xs" />
                        <span className="inline-flex items-center gap-1 text-sm tabular-nums">
                          {count}
                          <ChevronRight className="w-3 h-3 text-muted-foreground" />
                        </span>
                      </button>
                    );
                  })}
                </Section>
              </>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============ Helpers ============

function computeStats(appts: AppointmentWithRefs[]) {
  const byStatus: Record<string, number> = {};
  const proMap = new Map<string, { id: string; name: string; color: string; count: number }>();
  const reasonMap = new Map<string, { id: string; name: string; color: string; count: number }>();

  for (const a of appts) {
    byStatus[a.status] = (byStatus[a.status] || 0) + 1;

    if (a.professional) {
      const prev = proMap.get(a.professional.id);
      if (prev) prev.count++;
      else proMap.set(a.professional.id, {
        id: a.professional.id,
        name: a.professional.name,
        color: a.professional.color,
        count: 1,
      });
    }

    if (a.reason) {
      const prev = reasonMap.get(a.reason.id);
      if (prev) prev.count++;
      else reasonMap.set(a.reason.id, {
        id: a.reason.id,
        name: a.reason.name,
        color: a.reason.color,
        count: 1,
      });
    }
  }

  const completed = byStatus['completed'] || 0;
  const cancelled = byStatus['cancelled'] || 0;
  const no_show = byStatus['no_show'] || 0;
  const closed = completed + cancelled + no_show;

  return {
    total: appts.length,
    completed,
    cancelled,
    no_show,
    byStatus,
    attendanceRate: closed > 0 ? (completed / closed) * 100 : null,
    topPros: Array.from(proMap.values()).sort((a, b) => b.count - a.count).slice(0, 5),
    topReasons: Array.from(reasonMap.values()).sort((a, b) => b.count - a.count).slice(0, 5),
  };
}

function computeUpcoming(appts: AppointmentWithRefs[], periodStart: Date, periodEnd: Date) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const tomorrowStart = startOfDay(addDays(now, 1));
  const tomorrowEnd = endOfDay(addDays(now, 1));
  const weekEnd = endOfDay(addDays(now, 6));

  // Janela de "próximos" = interseção entre [agora, +7d] e o período selecionado.
  // Para períodos puramente passados (ex.: 7d/30d até hoje) sobra apenas hoje;
  // para períodos que cobrem o futuro (ex.: "Este mês"), respeita o limite do período.
  const winStart = now > periodStart ? now : periodStart;
  const winEnd = periodEnd < weekEnd ? periodEnd : weekEnd;

  let today = 0;
  let tomorrow = 0;
  let week = 0;

  if (winStart > winEnd) {
    return { today: 0, tomorrow: 0, week: 0 };
  }

  for (const a of appts) {
    if (a.status === 'cancelled' || a.status === 'no_show') continue;
    const d = new Date(a.start_at);
    if (d < winStart || d > winEnd) continue;

    if (d >= todayStart && d <= todayEnd) today++;
    else if (d >= tomorrowStart && d <= tomorrowEnd) tomorrow++;

    week++;
  }
  return { today, tomorrow, week };
}

function Kpi({
  label,
  value,
  pct,
  tone = 'default',
  icon,
  onClick,
}: {
  label: string;
  value: number;
  pct?: number;
  tone?: 'default' | 'success' | 'danger' | 'warning';
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-emerald-500',
    danger: 'text-destructive',
    warning: 'text-amber-500',
  }[tone];
  const interactive = !!onClick;
  return (
    <Card
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        'p-3 space-y-1',
        interactive &&
          'cursor-pointer transition-colors hover:bg-accent/40 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-2xl font-semibold tabular-nums', toneClass)}>{value}</span>
        {pct !== undefined && value > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {pct.toFixed(0)}%
          </span>
        )}
      </div>
    </Card>
  );
}

function ProgressBar({ value, tone = 'default' }: { value: number; tone?: 'default' | 'success' }) {
  const bg = tone === 'success' ? 'bg-emerald-500' : 'bg-primary';
  return (
    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={cn('h-full transition-all', bg)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function NextStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground inline-flex items-center gap-1.5 uppercase tracking-wide">
        {icon}
        {title}
      </h4>
      <Card className="p-3 space-y-1.5">{children}</Card>
    </div>
  );
}

function RankRow({
  name,
  color,
  value,
  max,
  onClick,
}: {
  name: string;
  color?: string | null;
  value: number;
  max: number;
  onClick?: () => void;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const Wrapper: any = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'space-y-1 w-full text-left',
        onClick &&
          'group cursor-pointer rounded-md -mx-1 px-1 py-1 hover:bg-accent/50 transition-colors',
      )}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-2 min-w-0 truncate">
          {color && (
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
          )}
          <span className="truncate">{name}</span>
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums text-foreground font-medium">
          {value}
          {onClick && (
            <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          )}
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: color || 'hsl(var(--primary))',
          }}
        />
      </div>
    </Wrapper>
  );
}

interface DrillData {
  items: AppointmentWithRefs[];
  series: { date: string; label: string; count: number }[];
  total: number;
}

function DrillView({ data }: { data: DrillData }) {
  if (data.total === 0) {
    return (
      <div className="text-center py-12 space-y-2">
        <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Nenhum agendamento no período</p>
      </div>
    );
  }
  const peak = Math.max(...data.series.map((d) => d.count));
  return (
    <div className="space-y-5">
      {/* KPIs do drill */}
      <div className="grid grid-cols-2 gap-2.5">
        <Card className="p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground">Total no período</p>
          <p className="text-2xl font-semibold tabular-nums">{data.total}</p>
        </Card>
        <Card className="p-3 space-y-1">
          <p className="text-[11px] text-muted-foreground">Pico em um dia</p>
          <p className="text-2xl font-semibold tabular-nums">{peak}</p>
        </Card>
      </div>

      {/* Evolução */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Evolução
        </h4>
        <Card className="p-3">
          <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="drillFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={28}
                />
                <Tooltip
                  cursor={{ stroke: 'hsl(var(--border))' }}
                  contentStyle={{
                    background: 'hsl(var(--popover))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                  formatter={(v: number) => [v, 'Agendamentos']}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#drillFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Lista de agendamentos */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Agendamentos ({data.total})
        </h4>
        <Card className="p-0 overflow-hidden divide-y divide-border">
          {data.items.map((a) => (
            <div key={a.id} className="px-3 py-2.5 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground tabular-nums">
                  {format(new Date(a.start_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
                <AppointmentStatusBadge status={a.status} size="xs" />
              </div>
              <p className="text-sm truncate">
                {a.title || a.reason?.name || 'Compromisso'}
              </p>
              {(a.lead || a.professional) && (
                <p className="text-[11px] text-muted-foreground truncate">
                  {a.lead?.name && <span>{a.lead.name}</span>}
                  {a.lead?.name && a.professional?.name && <span> · </span>}
                  {a.professional?.name && <span>{a.professional.name}</span>}
                </p>
              )}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 space-y-2">
      <BarChart3 className="w-10 h-10 mx-auto text-muted-foreground/50" />
      <p className="text-sm text-muted-foreground">Nenhum agendamento no período</p>
    </div>
  );
}
