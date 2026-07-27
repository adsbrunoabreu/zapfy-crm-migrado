import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { TrendingDown, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { OutcomesFunnel } from '@/components/dashboard/OutcomesFunnel';
import { formatBRL } from '@/lib/format';
import type {
  PipelineReportDaily, PipelineReportStage, PipelineReportKpis,
} from '@/hooks/usePipelinePerformance';

interface Props {
  daily: PipelineReportDaily[];
  prevDaily?: PipelineReportDaily[];
  stages: PipelineReportStage[];
  kpis: PipelineReportKpis | undefined;
}

function formatHours(h: number): string {
  if (!h || h < 0.01) return '—';
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export function OverviewTab({ daily, prevDaily = [], stages, kpis }: Props) {
  // Comparativo período atual vs anterior, alinhados por índice de dia
  const chart = useMemo(() => {
    const len = Math.max(daily.length, prevDaily.length);
    const out: Array<Record<string, string | number>> = [];
    for (let i = 0; i < len; i++) {
      const cur = daily[i];
      const prev = prevDaily[i];
      out.push({
        day: cur ? format(new Date(cur.day), 'dd/MM', { locale: ptBR }) : `D+${i + 1}`,
        Ganhos: cur?.won ?? 0,
        Perdidos: cur?.lost ?? 0,
        Reaberturas: cur?.reopened ?? 0,
        'Fechados (ant.)': prev ? (prev.won + prev.lost) : 0,
      });
    }
    return out;
  }, [daily, prevDaily]);

  // Funil estágio-a-estágio (drop rate, valor potencial via current_count*ticket, tempo médio acumulado)
  const funnel = useMemo(() => {
    const list = stages
      .filter((s) => s.stage_type === 'normal')
      .sort((a, b) => a.position - b.position);
    if (list.length === 0) return [] as Array<PipelineReportStage & {
      pct: number;
      conversion: number | null;
      drop: number | null;
      cumHours: number;
    }>;
    const max = Math.max(1, ...list.map((s) => s.entries));
    let cumHours = 0;
    return list.map((s, idx) => {
      cumHours += s.avg_hours_in_stage ?? 0;
      const prev = idx === 0 ? null : list[idx - 1];
      const conversion = prev && prev.entries > 0 ? (s.entries / prev.entries) * 100 : null;
      const drop = conversion == null ? null : 100 - conversion;
      return {
        ...s,
        pct: (s.entries / max) * 100,
        conversion,
        drop,
        cumHours,
      };
    });
  }, [stages]);

  const closings = {
    wonCount: kpis?.won ?? 0,
    lostCount: kpis?.lost ?? 0,
    closedCount: kpis?.closed ?? 0,
    wonRevenue: kpis?.revenue_won ?? 0,
    lostRevenue: kpis?.revenue_lost ?? 0,
    winRateClosed: (kpis?.closed ?? 0) > 0 ? ((kpis!.won / kpis!.closed) * 100) : 0,
    lossRate: (kpis?.closed ?? 0) > 0 ? ((kpis!.lost / kpis!.closed) * 100) : 0,
    avgWonTicket: kpis?.avg_ticket_won ?? 0,
    avgCycleDays: kpis?.avg_cycle_days ?? 0,
  };

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-1">Fechamentos & Reaberturas</h3>
          <p className="text-xs text-muted-foreground mb-4">Linha cinza = total fechado no período anterior alinhado por índice de dia</p>
          {chart.length === 0 ? (
            <EmptyState title="Sem fechamentos no período" />
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Ganhos" stackId="closed" fill="hsl(var(--emerald))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Perdidos" stackId="closed" fill="hsl(var(--rose))" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="Reaberturas" stroke="hsl(var(--amber))" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="Fechados (ant.)"
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <OutcomesFunnel closings={closings} reopenedCount={kpis?.reopened ?? 0} />
      </section>

      <Card className="p-5">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium">Funil estágio-a-estágio</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Taxa de drop entre estágios, leads parados, valor potencial e tempo médio acumulado
            </p>
          </div>
        </div>

        {funnel.length === 0 ? (
          <EmptyState title="Sem estágios disponíveis" />
        ) : (
          <div className="space-y-3">
            {funnel.map((s) => {
              const isHighDrop = (s.drop ?? 0) >= 50;
              return (
                <div key={s.stage_id}>
                  <div className="flex items-center justify-between text-sm mb-1 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: s.color ?? 'hsl(var(--muted-foreground))' }}
                      />
                      <span className="truncate text-foreground font-medium">{s.name}</span>
                      {s.conversion !== null && (
                        <span
                          className={`text-[11px] inline-flex items-center gap-0.5 ${
                            isHighDrop ? 'text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {isHighDrop ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />}
                          {s.conversion.toFixed(0)}% do anterior
                          {s.drop != null && (
                            <span className="text-muted-foreground">· perdeu {s.drop.toFixed(0)}%</span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums shrink-0">
                      <span title="Leads parados aqui agora">
                        Atual: <span className="text-foreground">{s.current_count}</span>
                      </span>
                      <span title="Entradas no período">
                        Entradas: <span className="text-foreground">{s.entries}</span>
                      </span>
                      <span title="Tempo médio neste estágio">{formatHours(s.avg_hours_in_stage)}</span>
                      <span title="Tempo médio acumulado até este estágio">
                        ac.{' '}
                        <span className="text-foreground">{formatHours(s.cumHours)}</span>
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.max(s.pct, 2)}%`, background: s.color ?? 'hsl(var(--primary))' }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="pt-3 mt-2 border-t border-border/50 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Receita ganha</p>
                <p className="text-sm font-semibold tabular-nums">{formatBRL(closings.wonRevenue)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Pipeline perdido</p>
                <p className="text-sm font-semibold tabular-nums text-destructive">
                  {formatBRL(closings.lostRevenue)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Maior drop</p>
                <p className="text-sm font-semibold tabular-nums">
                  {(() => {
                    const worst = funnel.filter(f => f.drop != null).sort((a, b) => (b.drop ?? 0) - (a.drop ?? 0))[0];
                    return worst ? `${worst.name} (${(worst.drop ?? 0).toFixed(0)}%)` : '—';
                  })()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Maior gargalo</p>
                <p className="text-sm font-semibold tabular-nums">
                  {(() => {
                    const worst = [...funnel].sort((a, b) => b.current_count - a.current_count)[0];
                    return worst ? `${worst.name} (${worst.current_count})` : '—';
                  })()}
                </p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
