import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useMemo } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { formatBRL } from '@/lib/format';
import { InfoHint } from '@/components/dashboard/InfoHint';
import type {
  PipelineByPipeline, PipelineReportStage,
} from '@/hooks/usePipelinePerformance';

interface Props {
  rows: PipelineByPipeline[];
  prevRows?: PipelineByPipeline[];
  stages?: PipelineReportStage[];
}

export function PipelinesTab({ rows, prevRows = [], stages = [] }: Props) {
  const chartData = useMemo(() => {
    const prevMap = new Map(prevRows.map((p) => [p.pipeline_id, p]));
    return rows.map((r) => {
      const closed = r.won + r.lost;
      const wr = closed > 0 ? Math.round((r.won / closed) * 100) : 0;
      const prev = prevMap.get(r.pipeline_id);
      const prevClosed = prev ? prev.won + prev.lost : 0;
      const prevWr = prevClosed > 0 ? Math.round((prev!.won / prevClosed) * 100) : 0;
      return {
        name: r.name,
        Atual: wr,
        Anterior: prevWr,
      };
    });
  }, [rows, prevRows]);

  // Volume atual por estágio (substituto leve do PipelineValueCard, sem total_value no RPC)
  const stageVolume = useMemo(() => {
    const ordered = [...stages]
      .filter((s) => s.current_count > 0)
      .sort((a, b) => b.current_count - a.current_count);
    const total = ordered.reduce((s, x) => s + x.current_count, 0);
    const max = ordered[0]?.current_count || 1;
    return { ordered, total, max };
  }, [stages]);

  if (rows.length === 0) {
    return <Card className="p-6"><EmptyState title="Nenhum pipeline com dados" /></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
          Win rate por pipeline (%)
          <InfoHint
            title="Win rate por pipeline"
            definition="Percentual de fechamentos ganhos dentro de cada pipeline, comparando o período atual com o anterior de mesma duração."
            formula="won / (won + lost) × 100"
          />
        </h3>
        <p className="text-xs text-muted-foreground mb-4">Verde = atual · cinza = anterior</p>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} domain={[0, 100]} />
              <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
              <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Anterior" fill="hsl(var(--muted-foreground) / 0.4)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="Atual" fill="hsl(var(--emerald))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-medium mb-4">Comparativo de pipelines</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border text-xs uppercase text-muted-foreground">
                <th className="py-2 font-medium">Pipeline</th>
                <th className="py-2 font-medium tabular-nums text-right">Leads</th>
                <th className="py-2 font-medium tabular-nums text-right">Ganhos</th>
                <th className="py-2 font-medium tabular-nums text-right">Perdidos</th>
                <th className="py-2 font-medium tabular-nums text-right">Win rate</th>
                <th className="py-2 font-medium tabular-nums text-right">Ciclo médio</th>
                <th className="py-2 font-medium tabular-nums text-right">Receita</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const closed = r.won + r.lost;
                const winRate = closed > 0 ? Math.round((r.won / closed) * 100) : null;
                return (
                  <tr key={r.pipeline_id} className="border-b border-border/50 last:border-0">
                    <td className="py-3 font-medium">{r.name}</td>
                    <td className="py-3 text-right tabular-nums">{r.leads}</td>
                    <td className="py-3 text-right tabular-nums text-emerald">{r.won}</td>
                    <td className="py-3 text-right tabular-nums text-destructive">{r.lost}</td>
                    <td className="py-3 text-right tabular-nums">{winRate == null ? '—' : `${winRate}%`}</td>
                    <td className="py-3 text-right tabular-nums text-muted-foreground">{r.avg_cycle_days == null ? '—' : `${r.avg_cycle_days}d`}</td>
                    <td className="py-3 text-right tabular-nums">{formatBRL(r.revenue)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {stageVolume.ordered.length > 0 && (
        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium inline-flex items-center gap-1.5">
                Volume atual por estágio
                <InfoHint
                  title="Volume atual por estágio"
                  definition="Quantidade de leads parados em cada estágio agora, considerando os filtros aplicados. Indica gargalos em tempo real."
                  formula="COUNT(leads agrupado por stage_id WHERE stage atual)"
                />
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Snapshot atual (independente do período)</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold tabular-nums">{stageVolume.total}</p>
              <p className="text-[11px] text-muted-foreground">leads em pipeline</p>
            </div>
          </div>
          <div className="space-y-1.5">
            {stageVolume.ordered.map((s) => {
              const pctMax = (s.current_count / stageVolume.max) * 100;
              const pctTotal = stageVolume.total > 0 ? (s.current_count / stageVolume.total) * 100 : 0;
              return (
                <div key={s.stage_id} className="relative rounded-md overflow-hidden border border-border/40">
                  <div
                    className="absolute inset-y-0 left-0 transition-[width] duration-500"
                    style={{ width: `${pctMax}%`, backgroundColor: `${s.color ?? 'hsl(var(--primary))'}22` }}
                  />
                  <div className="relative flex items-center justify-between px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color ?? 'hsl(var(--primary))' }} />
                      <span className="font-medium truncate">{s.name}</span>
                      <span className="text-muted-foreground text-[10px]">({s.stage_type})</span>
                    </div>
                    <div className="flex items-baseline gap-2 shrink-0 tabular-nums">
                      <span className="font-semibold">{s.current_count}</span>
                      <span className="text-[10px] text-muted-foreground w-9 text-right">{pctTotal.toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
