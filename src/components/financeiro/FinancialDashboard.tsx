import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker, DEFAULT_PRESETS } from '@/components/ui/date-range-picker';
import { KpiDeltaCard } from '@/components/financeiro/KpiDeltaCard';
import { PendingReceivablesAlert } from '@/components/financeiro/PendingReceivablesAlert';
import { useFinancialDashboard } from '@/hooks/finance/useFinancial';
import { usePipelines } from '@/hooks/usePipelines';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { formatBRL } from '@/lib/finance';
import { getAppRangeForPreset, serializeAppDate } from '@/lib/appDate';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Wallet, TrendingUp, ArrowDownCircle, ArrowUpCircle, Scale, Target,
  Percent, Users, CalendarClock, Trophy, AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, PieChart, Pie, Cell, Legend,
} from 'recharts';

const STATUS_LABEL: Record<string, string> = {
  new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado',
  proposal: 'Proposta', negotiation: 'Negociação', won: 'Ganho', lost: 'Perdido',
};
const AGING_LABEL: Record<string, string> = {
  a_vencer: 'A vencer', d1_7: '1-7 dias', d8_30: '8-30 dias',
  d31_60: '31-60 dias', d60_plus: '60+ dias', sem_vencimento: 'Sem vencimento',
};
const AGING_ORDER = ['a_vencer', 'd1_7', 'd8_30', 'd31_60', 'd60_plus', 'sem_vencimento'];
const AGING_COLOR: Record<string, string> = {
  a_vencer: 'hsl(var(--cyan))', d1_7: 'hsl(var(--amber))',
  d8_30: 'hsl(var(--amber))', d31_60: 'hsl(var(--rose))',
  d60_plus: 'hsl(var(--rose))', sem_vencimento: 'hsl(var(--muted-foreground))',
};

export type FinancialDashboardFilters = {
  from: Date;
  to: Date;
  presetKey?: string;
  pipelineId: string;
  ownerId: string;
};

export function getDefaultFinancialFilters(): FinancialDashboardFilters {
  const r = getAppRangeForPreset('30d');
  return { from: r.from, to: r.to, presetKey: '30d', pipelineId: 'all', ownerId: 'all' };
}

export function FinancialDashboardFiltersBar({
  value,
  onChange,
}: {
  value: FinancialDashboardFilters;
  onChange: (v: FinancialDashboardFilters) => void;
}) {
  const { data: pipelines } = usePipelines();
  const { data: members } = useTeamMembers();
  return (
    <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
      <Select value={value.pipelineId} onValueChange={(v) => onChange({ ...value, pipelineId: v })}>
        <SelectTrigger className="h-9 w-[180px] bg-secondary/50 border-border/50 text-xs">
          <SelectValue placeholder="Pipeline" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os pipelines</SelectItem>
          {pipelines?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.ownerId} onValueChange={(v) => onChange({ ...value, ownerId: v })}>
        <SelectTrigger className="h-9 w-[180px] bg-secondary/50 border-border/50 text-xs">
          <SelectValue placeholder="Responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os responsáveis</SelectItem>
          {members?.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <DateRangePicker
        value={{ from: value.from, to: value.to }}
        activePresetKey={value.presetKey}
        presets={DEFAULT_PRESETS}
        align="end"
        className="bg-secondary/50 border-border/50 h-9 text-xs"
        onChange={(range, key) => {
          if (range?.from && range?.to) {
            onChange({ ...value, from: range.from, to: range.to, presetKey: key });
          } else {
            onChange({ ...value, presetKey: key });
          }
        }}
      />
    </div>
  );
}

export function FinancialDashboard({ filters }: { filters?: FinancialDashboardFilters } = {}) {
  const fallback = useMemo(() => getDefaultFinancialFilters(), []);
  const f = filters ?? fallback;

  const { data, isLoading, isFetching, error, refetch } = useFinancialDashboard({
    dateFrom: serializeAppDate(f.from),
    dateTo: serializeAppDate(f.to),
    pipelineId: f.pipelineId === 'all' ? null : f.pipelineId,
    assignedTo: f.ownerId === 'all' ? null : f.ownerId,
  });

  return (
    <div className="space-y-6">
      {isFetching && !isLoading && (
        <div className="text-xs text-muted-foreground -mb-2">atualizando…</div>
      )}


      {isLoading ? (
        <DashboardSkeleton />
      ) : error ? (
        <Card className="p-6 text-center space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-rose" />
          <div>
            <p className="text-sm font-medium">Não foi possível carregar o painel</p>
            <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
          </div>
          <button onClick={() => refetch()} className="text-xs underline text-primary">Tentar novamente</button>
        </Card>
      ) : !data ? (
        <Card className="p-6 text-center">
          <p className="text-sm text-muted-foreground">Sem dados para exibir.</p>
        </Card>
      ) : (
        <>
          {/* Alerta de orçamentos aguardando confirmação */}
          <PendingReceivablesAlert />

          {/* ROW 1 — Receita */}
          <Section title="Receita">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <KpiDeltaCard
                label="Vendas fechadas (ganho)"
                tooltip="Soma do valor das fichas marcadas como Ganho no pipeline neste período. Ainda NÃO significa dinheiro no caixa — apenas que a venda foi fechada."
                value={formatBRL(data.kpis.revenue_won)}
                current={data.kpis.revenue_won}
                previous={data.kpis.revenue_won_prev}
                tone="success"
                icon={<Trophy className="w-4 h-4" />}
                hint={`${data.kpis.count_won} fichas`}
              />
              <KpiDeltaCard
                label="Recebido (pago)"
                tooltip="Dinheiro que efetivamente entrou no caixa neste período (contas a receber marcadas como Pago)."
                value={formatBRL(data.kpis.received)}
                current={data.kpis.received}
                previous={data.kpis.received_prev}
                tone="success"
                icon={<ArrowDownCircle className="w-4 h-4" />}
              />
              <KpiDeltaCard
                label="A receber"
                tooltip="Contas a receber em aberto (pendentes, parciais ou em atraso) — vendas fechadas que ainda não foram confirmadas como pagas."
                value={formatBRL(data.kpis.to_receive)}
                tone="info"
                icon={<Wallet className="w-4 h-4" />}
              />
              <KpiDeltaCard
                label="Ticket médio (ganho)"
                value={formatBRL(data.kpis.avg_ticket)}
                current={data.kpis.avg_ticket}
                previous={data.kpis.avg_ticket_prev}
                tone="default"
                icon={<Target className="w-4 h-4" />}
              />
              <KpiDeltaCard
                label="Win rate"
                value={`${data.kpis.win_rate.toFixed(1)}%`}
                current={data.kpis.win_rate}
                previous={data.kpis.win_rate_prev}
                tone="info"
                icon={<Percent className="w-4 h-4" />}
                hint={`${data.kpis.count_won}/${data.kpis.count_won + data.kpis.count_lost}`}
              />
            </div>
          </Section>


          {/* ROW 2 — Custos & resultado */}
          <Section title="Custos & resultado">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiDeltaCard
                label="A pagar"
                value={formatBRL(data.kpis.to_pay)}
                tone="warning"
                icon={<ArrowUpCircle className="w-4 h-4" />}
              />
              <KpiDeltaCard
                label="Pago no período"
                value={formatBRL(data.kpis.paid_out)}
                current={data.kpis.paid_out}
                previous={data.kpis.paid_out_prev}
                tone="danger"
                icon={<ArrowUpCircle className="w-4 h-4" />}
              />
              <KpiDeltaCard
                label="Lucro líquido"
                value={formatBRL(data.kpis.net_profit)}
                current={data.kpis.net_profit}
                previous={data.kpis.net_profit_prev}
                tone={data.kpis.net_profit >= 0 ? 'success' : 'danger'}
                icon={<Scale className="w-4 h-4" />}
                hint="recebido − pago"
              />
              <KpiDeltaCard
                label="Margem"
                value={`${data.kpis.margin_pct.toFixed(1)}%`}
                tone={data.kpis.margin_pct >= 0 ? 'success' : 'danger'}
                icon={<Percent className="w-4 h-4" />}
              />
            </div>
          </Section>

          {/* ROW 3 — Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ChartCard title="Fluxo de caixa diário" subtitle="Recebido vs pago">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.cashflow}>
                  <defs>
                    <linearGradient id="gR" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--emerald))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--emerald))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--rose))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--rose))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="day"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickFormatter={(v) => format(parseISO(v), 'dd/MM', { locale: ptBR })}
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name) => [formatBRL(v), name === 'received' ? 'Recebido' : 'Pago']}
                    labelFormatter={(v) => format(parseISO(v as string), "dd 'de' MMM", { locale: ptBR })}
                  />
                  <Area type="monotone" dataKey="received" stroke="hsl(var(--emerald))" fill="url(#gR)" strokeWidth={2} />
                  <Area type="monotone" dataKey="paid_out" stroke="hsl(var(--rose))" fill="url(#gP)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Funil de receita" subtitle="Por status do pipeline">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={(data.funnel ?? []).map((f) => ({ ...f, label: STATUS_LABEL[f.status] ?? f.status }))} layout="vertical">
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} width={90} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, _n, p) => [`${formatBRL(v)} • ${p.payload.count} fichas`, 'Total']}
                  />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Receita por categoria" subtitle="Entradas pagas">
              {data.by_category.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={data.by_category} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                      {data.by_category.map((c, i) => (
                        <Cell key={i} fill={c.color || `hsl(${(i * 47) % 360} 60% 55%)`} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => formatBRL(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Aging de recebíveis" subtitle="Inadimplência por faixa">
              {data.aging.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={AGING_ORDER
                      .map((b) => data.aging.find((a) => a.bucket === b) ?? { bucket: b, value: 0, count: 0 })
                      .map((a) => ({ ...a, label: AGING_LABEL[a.bucket] }))}
                  >
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number, _n, p) => [`${formatBRL(v)} • ${p.payload.count} títulos`, 'Total']}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {AGING_ORDER.map((b, i) => <Cell key={i} fill={AGING_COLOR[b]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* ROW 4 — Tabelas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ListCard title="Top clientes" subtitle="Por receita no período" icon={<Users className="w-4 h-4" />}>
              {data.top_customers.length === 0 ? (
                <EmptyList msg="Sem entradas pagas no período." />
              ) : (
                <ul className="divide-y divide-border/40">
                  {data.top_customers.map((c, i) => (
                    <li key={i} className="flex items-center justify-between py-2 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                        <span className="truncate">{c.name}</span>
                        <Badge variant="outline" className="text-[10px] h-5">{c.count}x</Badge>
                      </div>
                      <span className="tabular-nums font-medium text-emerald">{formatBRL(c.value)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </ListCard>

            <ListCard title="Próximos vencimentos" subtitle="Próximos 7 dias" icon={<CalendarClock className="w-4 h-4" />}>
              {data.upcoming.length === 0 ? (
                <EmptyList msg="Nenhum título vence nos próximos 7 dias." />
              ) : (
                <ul className="divide-y divide-border/40">
                  {data.upcoming.map((u) => (
                    <li key={u.id} className="flex items-center justify-between py-2 text-sm gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[10px] h-5 ${u.kind === 'receivable' ? 'text-cyan border-cyan/30' : 'text-amber border-amber/30'}`}>
                            {u.kind === 'receivable' ? 'A receber' : 'A pagar'}
                          </Badge>
                          <span className="truncate">{u.description}</span>
                        </div>
                        {u.party_name && (
                          <div className="text-xs text-muted-foreground truncate mt-0.5">{u.party_name}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`tabular-nums font-medium ${u.kind === 'receivable' ? 'text-cyan' : 'text-amber'}`}>
                          {formatBRL(u.amount)}
                        </div>
                        <div className="text-[11px] text-muted-foreground tabular-nums">
                          {format(parseISO(u.due_date), 'dd/MM', { locale: ptBR })}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </ListCard>

            <ListCard title="Performance por responsável" subtitle="Ganhos no período" icon={<Trophy className="w-4 h-4" />}>
              {data.owners.length === 0 ? (
                <EmptyList msg="Sem fichas fechadas no período." />
              ) : (
                <ul className="divide-y divide-border/40">
                  {data.owners.map((o, i) => {
                    const wr = o.closed_count > 0 ? (o.won_count / o.closed_count) * 100 : 0;
                    return (
                      <li key={o.user_id ?? i} className="flex items-center justify-between py-2 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
                          <span className="truncate">{o.name}</span>
                          <Badge variant="outline" className="text-[10px] h-5">{wr.toFixed(0)}% win</Badge>
                        </div>
                        <div className="text-right">
                          <div className="tabular-nums font-medium text-emerald">{formatBRL(o.won_value)}</div>
                          <div className="text-[11px] text-muted-foreground tabular-nums">{o.won_count}/{o.closed_count}</div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </ListCard>

            <ListCard title="Pipeline aberto" subtitle="Snapshot do período" icon={<Wallet className="w-4 h-4" />}>
              <div className="space-y-3 py-2">
                <Row label="Em negociação" value={formatBRL(data.kpis.open_value)} sub={`${data.kpis.count_open} fichas`} tone="info" />
                <Row label="Perdido" value={formatBRL(data.kpis.lost_value)} sub={`${data.kpis.count_lost} fichas`} tone="danger" />
                <Row label="Fichas no período" value={String(data.kpis.count_total)} sub="criadas/fechadas" tone="default" />
              </div>
            </ListCard>
          </div>

          <p className="text-[11px] text-muted-foreground text-center pt-2">
            Período: {format(parseISO(data.period.from), "dd/MM/yyyy", { locale: ptBR })} – {format(parseISO(data.period.to), "dd/MM/yyyy", { locale: ptBR })}
            {' · '}Comparado com {format(parseISO(data.period.prev_from), 'dd/MM', { locale: ptBR })} – {format(parseISO(data.period.prev_to), 'dd/MM/yyyy', { locale: ptBR })}
            {' · '}America/Sao_Paulo
          </p>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-3">{title}</h2>
      {children}
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </Card>
  );
}

function ListCard({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">{icon}{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

function Row({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'default' | 'success' | 'danger' | 'info' }) {
  const cls = { default: 'text-foreground', success: 'text-emerald', danger: 'text-rose', info: 'text-cyan' }[tone];
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm">{label}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="h-[260px] flex flex-col items-center justify-center text-muted-foreground gap-2">
      <AlertCircle className="w-6 h-6" />
      <span className="text-xs">Sem dados no período</span>
    </div>
  );
}

function EmptyList({ msg }: { msg: string }) {
  return <p className="text-xs text-muted-foreground py-6 text-center">{msg}</p>;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[110px]" />)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[110px]" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[300px]" />)}
      </div>
    </div>
  );
}
