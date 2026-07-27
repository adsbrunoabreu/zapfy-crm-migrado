import { PageShell } from '@/components/layout/PageShell';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAttendanceReports } from '@/hooks/useAttendanceReports';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanies } from '@/hooks/useCompanies';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useReportsRealtime } from '@/hooks/useReportsRealtime';
import { MetricCard } from '@/components/ui/metric-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { FilterPopoverButton } from '@/components/filters/FilterPopoverButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DateRangePicker, DEFAULT_PRESETS, type DateRange } from '@/components/ui/date-range-picker';
import { parsePersistedAppDateRange, serializeAppDateRange } from '@/lib/appDate';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid,
  BarChart, Bar, Legend,
} from 'recharts';
import {
  Ticket, CheckCircle2, Clock, ArrowLeftRight, Star, MessageSquareReply,
  TrendingUp, AlertCircle, Download, RefreshCw, Timer, Target, ShieldAlert,
  Gauge, MessagesSquare, Percent, Info, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react';
import { useSortableData, type SortAccessor } from '@/hooks/useSortableData';
import type { AttendanceReportData } from '@/hooks/useAttendanceReports';
import { ReportTypeSwitcher } from '@/components/reports/ReportTypeSwitcher';
import { MessagesByHourChart } from '@/components/reports/attendance/MessagesByHourChart';

type PeriodKey = 'today' | 'yesterday' | '7d' | '15d' | '30d' | '60d' | '90d' | 'mtd' | 'ytd' | 'custom';

const PERIOD_KEY = 'attendanceReports.period';
const RANGE_KEY = 'attendanceReports.customRange';

interface PersistedRange { from: string; to: string }

function formatMinutes(min: number): string {
  if (!min || min < 1) return '< 1 min';
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m}m`;
}

function formatSeconds(sec: number): string {
  if (!sec || sec < 1) return '—';
  if (sec < 60) return `${Math.round(sec)} s`;
  return formatMinutes(sec / 60);
}

function tmrTone(sec: number): 'good' | 'warn' | 'bad' {
  if (sec <= 0) return 'good';
  if (sec < 5 * 60) return 'good';
  if (sec <= 15 * 60) return 'warn';
  return 'bad';
}

function csatTone(score: number): 'good' | 'warn' | 'bad' {
  if (score >= 4.5) return 'good';
  if (score >= 3.5) return 'warn';
  return 'bad';
}

const TONE_DOT: Record<'good' | 'warn' | 'bad', string> = {
  good: 'bg-[hsl(var(--emerald))]',
  warn: 'bg-[hsl(var(--amber))]',
  bad: 'bg-[hsl(var(--rose))]',
};

function resolveRange(period: PeriodKey, custom?: DateRange): DateRange {
  if (period === 'custom' && custom) return custom;
  const p = DEFAULT_PRESETS.find(x => x.key === period);
  return p ? p.getRange() : (DEFAULT_PRESETS.find(x => x.key === '30d')!.getRange());
}

export default function AttendanceReports() {
  const { isMaster, profile } = useAuth();
  const { data: companies } = useCompanies();

  const [period, setPeriod] = usePersistedState<PeriodKey>(PERIOD_KEY, '30d');
  const [persistedRange, setPersistedRange] = usePersistedState<PersistedRange | null>(RANGE_KEY, null);
  const [companyId, setCompanyId] = usePersistedState<string | undefined>('attendanceReports.companyId', undefined);
  const [agentId, setAgentId] = usePersistedState<string | undefined>('attendanceReports.agentId', undefined);

  const customRange = useMemo<DateRange | undefined>(() => {
    const parsed = parsePersistedAppDateRange(persistedRange ?? undefined);
    return parsed ? { from: parsed.from, to: parsed.to } : undefined;
  }, [persistedRange]);

  const range = useMemo(() => resolveRange(period, customRange), [period, customRange]);

  const { data, isLoading, isFetching, error, refetch } = useAttendanceReports({
    from: range.from,
    to: range.to,
    companyId,
    agentId,
  });

  useReportsRealtime(companyId ?? profile?.company_id ?? undefined);

  const totals = data?.totals;
  const ratings = data?.ratings;

  const dailyChart = useMemo(
    () => (data?.daily ?? []).map(d => ({
      day: format(new Date(d.day), 'dd/MM', { locale: ptBR }),
      Criados: d.created,
      Fechados: d.closed,
    })),
    [data?.daily]
  );

  const scoreChart = useMemo(
    () => (data?.score_distribution ?? []).map(s => ({
      score: `${s.score}`,
      Avaliações: s.count,
    })),
    [data?.score_distribution]
  );

  const handleRangeChange = (r: DateRange, key?: string) => {
    if (key && key !== 'custom') {
      setPeriod(key as PeriodKey);
      setPersistedRange(null);
    } else {
      setPeriod('custom');
      setPersistedRange(serializeAppDateRange(r));
    }
  };

  const handleExportCsv = () => {
    if (!data) return;
    const escape = (v: unknown) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",;\n\r]/.test(s) ? `"${s}"` : s;
    };
    const sections: { title: string; headers: string[]; rows: (string | number)[][] }[] = [
      {
        title: 'KPIs',
        headers: ['Métrica', 'Valor'],
        rows: [
          ['Total de tickets', totals?.total ?? 0],
          ['Em aberto', (totals?.open ?? 0) + (totals?.in_progress ?? 0) + (totals?.reopened ?? 0)],
          ['Encerrados', totals?.closed_in_period ?? 0],
          ['Tempo médio (min)', (data.avg_handle_minutes ?? 0).toFixed(2)],
          ['Transferências', data.transfers ?? 0],
          ['Solicitações de avaliação', ratings?.total_requested ?? 0],
          ['Respondidas', ratings?.responded ?? 0],
          ['Pendentes', ratings?.pending ?? 0],
          ['Expiradas', ratings?.expired ?? 0],
          ['Taxa de resposta (%)', ratings?.response_rate ?? 0],
          ['Taxa de expiração (%)', ratings?.expire_rate ?? 0],
          ['Pontuação média', ratings?.avg_score ?? 0],
          ['NPS', ratings?.nps ?? ''],
        ],
      },
      {
        title: 'Tickets por dia',
        headers: ['Dia', 'Criados', 'Fechados'],
        rows: (data.daily ?? []).map(d => [d.day, d.created, d.closed]),
      },
      {
        title: 'Distribuição de notas',
        headers: ['Nota', 'Quantidade'],
        rows: (data.score_distribution ?? []).map(s => [s.score, s.count]),
      },
      {
        title: 'Performance por agente',
        headers: ['Agente', 'Total', 'Em aberto', 'Encerrados', 'Tempo médio (min)'],
        rows: (data.by_agent ?? []).map(a => [
          a.name, a.total, a.open, a.closed, a.avg_handle_min.toFixed(2),
        ]),
      },
    ];

    const lines: string[] = [];
    sections.forEach((sec, i) => {
      if (i > 0) lines.push('');
      lines.push(`# ${sec.title}`);
      lines.push(sec.headers.join(';'));
      sec.rows.forEach(r => lines.push(r.map(escape).join(';')));
    });

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorios_atendimento_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Relatório exportado em CSV');
  };

  const agentOptions = useMemo(() => data?.by_agent ?? [], [data?.by_agent]);

  return (
    <PageShell
      title="Relatórios de Atendimento"
      subtitle={`Métricas de tickets e avaliações no período selecionado.${isFetching && !isLoading ? ' · atualizando…' : ''}`}
      actions={
        <>
          <ReportTypeSwitcher active="attendance" />
          <Button
            type="button"
            variant="outline"
            className="h-9 bg-secondary/50 border-border/50 text-xs gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Atualizar dados"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-9 bg-secondary/50 border-border/50 text-xs gap-2"
            onClick={handleExportCsv}
            disabled={!data}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </Button>

          <FilterPopoverButton
            activeCount={(companyId ? 1 : 0) + (agentId ? 1 : 0)}
            onClear={() => { setCompanyId(undefined); setAgentId(undefined); }}
          >
            {isMaster && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Empresa</Label>
                <Select value={companyId ?? 'mine'} onValueChange={(v) => setCompanyId(v === 'mine' ? undefined : v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mine">Minha empresa</SelectItem>
                    {(companies ?? []).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Agente</Label>
              <Select value={agentId ?? 'all'} onValueChange={(v) => setAgentId(v === 'all' ? undefined : v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Agente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os agentes</SelectItem>
                  {agentOptions.map(a => (
                    <SelectItem key={a.user_id} value={a.user_id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </FilterPopoverButton>

          <DateRangePicker
            value={range}
            activePresetKey={period}
            presets={DEFAULT_PRESETS}
            align="end"
            onChange={handleRangeChange}
          />
        </>
      }
    >

      {error && (
        <Card className="p-6 border-destructive/50">
          <p className="text-sm text-destructive">Erro ao carregar relatórios: {(error as Error).message}</p>
        </Card>
      )}

      {isLoading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : (
        <>
          {(() => {
            const prev = data?.previous;
            const csat = ratings?.avg_score ?? 0;
            const prevCsat = prev?.csat ?? 0;
            const pct = (curr: number, p: number): number | null => {
              if (!p || p === 0) return null;
              return ((curr - p) / p) * 100;
            };
            const renderDelta = (curr: number, p: number, lowerIsBetter = false) => {
              const d = pct(curr, p);
              if (d === null || !isFinite(d)) return undefined;
              return { value: lowerIsBetter ? -d : d, label: 'vs período anterior' };
            };

            type Kpi = {
              key: string;
              label: string;
              hint: string;
              value: React.ReactNode;
              icon: React.ReactNode;
              dot?: 'good' | 'warn' | 'bad';
              delta?: { value: number; label?: string };
            };

            const kpis: Kpi[] = [
              {
                key: 'tmr',
                label: 'TMR — 1ª resposta',
                hint: 'Tempo médio entre a primeira mensagem do cliente e a primeira resposta humana do agente.',
                value: formatSeconds(data?.tmr_seconds ?? 0),
                icon: <Timer />,
                dot: tmrTone(data?.tmr_seconds ?? 0),
                delta: prev ? renderDelta(data?.tmr_seconds ?? 0, prev.tmr_seconds, true) : undefined,
              },
              {
                key: 'tma',
                label: 'TMA — atendimento',
                hint: 'Tempo médio entre a abertura e o encerramento do ticket.',
                value: formatMinutes(data?.avg_handle_minutes ?? 0),
                icon: <Clock />,
                delta: prev ? renderDelta(data?.avg_handle_minutes ?? 0, prev.avg_handle_minutes, true) : undefined,
              },
              {
                key: 'fcr',
                label: 'FCR — resolução no 1º contato',
                hint: 'Percentual de tickets fechados sem terem sido reabertos.',
                value: `${data?.fcr_rate ?? 0}%`,
                icon: <Target />,
                delta: prev ? renderDelta(data?.fcr_rate ?? 0, prev.fcr_rate) : undefined,
              },
              {
                key: 'csat',
                label: 'CSAT médio',
                hint: 'Nota média (1 a 5) das avaliações respondidas pelos clientes pós-atendimento.',
                value: csat > 0 ? csat.toFixed(2) : '—',
                icon: <Star />,
                dot: csatTone(csat),
                delta: prev ? renderDelta(csat, prevCsat) : undefined,
              },
              {
                key: 'closed',
                label: 'Tickets encerrados',
                hint: 'Total de atendimentos finalizados dentro do período.',
                value: totals?.closed_in_period ?? 0,
                icon: <CheckCircle2 />,
                delta: prev ? renderDelta(totals?.closed_in_period ?? 0, prev.closed) : undefined,
              },
              {
                key: 'sla',
                label: 'SLA — resposta no prazo',
                hint: 'Percentual de primeiras respostas humanas dentro do alvo de 5 minutos.',
                value: `${data?.sla_response_rate ?? 0}%`,
                icon: <Gauge />,
                delta: prev ? renderDelta(data?.sla_response_rate ?? 0, prev.sla_response_rate) : undefined,
              },
              {
                key: 'transbordo',
                label: 'Taxa de transbordo',
                hint: 'Percentual de tickets que passaram por mais de um agente (escalonamento ou transferência).',
                value: `${data?.transbordo_rate ?? 0}%`,
                icon: <ShieldAlert />,
                delta: prev ? renderDelta(data?.transbordo_rate ?? 0, prev.transbordo_rate, true) : undefined,
              },
              {
                key: 'msgs',
                label: 'Mensagens / atendimento',
                hint: 'Média de mensagens trocadas em cada ticket encerrado no período.',
                value: data?.messages_per_ticket ?? 0,
                icon: <MessagesSquare />,
                delta: prev ? renderDelta(data?.messages_per_ticket ?? 0, prev.messages_per_ticket) : undefined,
              },
              {
                key: 'conv',
                label: 'Taxa de conversão',
                hint: 'Percentual de leads ganhos no CRM em relação ao total de tickets encerrados no período.',
                value: `${data?.conversion_rate ?? 0}%`,
                icon: <Percent />,
                delta: prev ? renderDelta(data?.conversion_rate ?? 0, prev.conversion_rate) : undefined,
              },
              {
                key: 'nps',
                label: 'NPS',
                hint: 'Net Promoter Score: % promotores (9-10) − % detratores (0-6). Apenas avaliações em escala NPS.',
                value: ratings?.nps !== null && ratings?.nps !== undefined ? ratings.nps.toFixed(1) : '—',
                icon: <TrendingUp />,
                delta: prev && prev.nps !== null && ratings?.nps !== null && ratings?.nps !== undefined
                  ? renderDelta(ratings.nps, prev.nps)
                  : undefined,
              },
            ];

            return (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {kpis.map(k => (
                  <MetricCard
                    key={k.key}
                    icon={k.icon}
                    value={k.value}
                    delta={k.delta}
                    label={
                      <Tooltip delayDuration={150}>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1.5 cursor-help">
                            {k.dot && <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[k.dot]}`} />}
                            {k.label}
                            <Info className="h-3 w-3 text-muted-foreground/70" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
                          {k.hint}
                        </TooltipContent>
                      </Tooltip>
                    }
                  />
                ))}
              </div>
            );
          })()}

          <MessagesByHourChart
            from={range.from}
            to={range.to}
            companyId={companyId}
            agentId={agentId}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="text-sm font-medium mb-4">Tickets por dia</h3>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                    <RTooltip
                      contentStyle={{
                        background: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="Criados" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="Fechados" stroke="hsl(var(--emerald-500, 142 71% 45%))" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="text-sm font-medium mb-4">Distribuição de notas</h3>
              {scoreChart.length === 0 ? (
                <EmptyState title="Sem avaliações respondidas no período" />
              ) : (
                <div className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreChart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="score" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                      <RTooltip
                        contentStyle={{
                          background: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="Avaliações" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </div>

          <AgentPerformanceTable rows={data?.by_agent ?? []} />
        </>
      )}
    </PageShell>
  );
}

type AgentRow = AttendanceReportData['by_agent'][number];
type AgentSortKey =
  | 'name' | 'total' | 'open' | 'closed'
  | 'avg_handle_min' | 'tmr_seconds' | 'sla_rate'
  | 'csat' | 'nps' | 'msgs_per_ticket' | 'expired_ratings';

const AGENT_ACCESSORS: Record<AgentSortKey, SortAccessor<AgentRow>> = {
  name: r => r.name ?? '',
  total: r => r.total ?? 0,
  open: r => r.open ?? 0,
  closed: r => r.closed ?? 0,
  avg_handle_min: r => r.avg_handle_min ?? 0,
  tmr_seconds: r => r.tmr_seconds ?? 0,
  sla_rate: r => r.sla_rate ?? 0,
  csat: r => r.csat ?? 0,
  nps: r => r.nps ?? -Infinity,
  msgs_per_ticket: r => r.msgs_per_ticket ?? 0,
  expired_ratings: r => (r.pending_ratings ?? 0) + (r.expired_ratings ?? 0),
};

function AgentPerformanceTable({ rows }: { rows: AgentRow[] }) {
  const { sorted, sort, toggle } = useSortableData<AgentRow, AgentSortKey>(
    rows,
    AGENT_ACCESSORS,
    { key: 'total', direction: 'desc' },
  );

  const SortHeader = ({
    label, sortKey, align = 'left',
  }: { label: string; sortKey: AgentSortKey; align?: 'left' | 'right' }) => {
    const active = sort.key === sortKey;
    const Icon = active ? (sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th className={`py-2 font-medium ${align === 'right' ? 'text-right' : ''}`}>
        <button
          type="button"
          onClick={() => toggle(sortKey)}
          className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${
            active ? 'text-foreground' : ''
          }`}
        >
          {label}
          <Icon className={`h-3 w-3 ${active ? 'opacity-100' : 'opacity-40'}`} />
        </button>
      </th>
    );
  };

  return (
    <Card className="p-5">
      <h3 className="text-sm font-medium mb-4">Performance por agente</h3>
      {rows.length === 0 ? (
        <EmptyState title="Nenhum agente ativo no período" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border text-xs uppercase text-muted-foreground">
                <SortHeader label="Agente" sortKey="name" />
                <SortHeader label="Total" sortKey="total" />
                <SortHeader label="Em aberto" sortKey="open" />
                <SortHeader label="Encerrados" sortKey="closed" />
                <SortHeader label="TMA" sortKey="avg_handle_min" />
                <SortHeader label="TMR" sortKey="tmr_seconds" />
                <SortHeader label="SLA" sortKey="sla_rate" />
                <SortHeader label="CSAT" sortKey="csat" />
                <SortHeader label="NPS" sortKey="nps" />
                <SortHeader label="Msgs/Atend." sortKey="msgs_per_ticket" />
                <SortHeader label="Pend./Exp." sortKey="expired_ratings" />
              </tr>
            </thead>
            <tbody>
              {sorted.map(a => (
                <tr key={a.user_id} className="border-b border-border/50 last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7">
                        <AvatarImage src={a.avatar_url ?? undefined} />
                        <AvatarFallback className="text-xs">
                          {a.name?.split(' ').map(n => n[0]).slice(0, 2).join('') ?? '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-foreground">{a.name}</span>
                    </div>
                  </td>
                  <td className="py-3 tabular-nums">{a.total}</td>
                  <td className="py-3 tabular-nums">{a.open}</td>
                  <td className="py-3 tabular-nums">{a.closed}</td>
                  <td className="py-3 tabular-nums text-muted-foreground">{formatMinutes(a.avg_handle_min)}</td>
                  <td className="py-3 tabular-nums text-muted-foreground">{formatSeconds(a.tmr_seconds ?? 0)}</td>
                  <td className="py-3 tabular-nums">{(a.sla_rate ?? 0)}%</td>
                  <td className="py-3 tabular-nums">{(a.csat ?? 0) > 0 ? a.csat.toFixed(2) : '—'}</td>
                  <td className="py-3 tabular-nums">{a.nps !== null && a.nps !== undefined ? a.nps.toFixed(1) : '—'}</td>
                  <td className="py-3 tabular-nums">{a.msgs_per_ticket ?? 0}</td>
                  <td className="py-3 tabular-nums text-muted-foreground">
                    {a.pending_ratings ?? 0} / <span className="text-[hsl(var(--rose))]">{a.expired_ratings ?? 0}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
