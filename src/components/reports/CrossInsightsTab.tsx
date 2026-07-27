import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useMemo } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid,
  ComposedChart, Bar, Line,
} from 'recharts';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { InfoHint } from '@/components/dashboard/InfoHint';
import { formatBRL } from '@/lib/format';
import { cn } from '@/lib/utils';
import type {
  PipelineByPipeline, PipelineByUser, PipelineByLossReason, PipelineReportStage,
} from '@/hooks/usePipelinePerformance';

interface Props {
  byPipeline: PipelineByPipeline[];
  byUser: PipelineByUser[];
  byLossReason: PipelineByLossReason[];
  stages: PipelineReportStage[];
}

const TOOLTIP_STYLE = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
};

export function CrossInsightsTab({ byPipeline, byUser, byLossReason, stages }: Props) {
  /* ============== 1. Estágio: tempo × win rate ============== */
  const stageInsight = useMemo(() => {
    const list = stages.filter((s) => s.stage_type === 'normal').sort((a, b) => a.position - b.position);
    if (list.length === 0) return [];
    const maxEntries = Math.max(1, ...list.map((s) => s.entries));
    return list.map((s, i) => {
      const next = list[i + 1];
      const conv = next && s.entries > 0 ? (next.entries / s.entries) * 100 : null;
      return {
        name: s.name,
        Tempo: Number((s.avg_hours_in_stage ?? 0).toFixed(1)),
        'Conversão p/ próximo': conv == null ? null : Number(conv.toFixed(1)),
        Volume: Math.round((s.entries / maxEntries) * 100),
      };
    });
  }, [stages]);

  /* ============== 2. Ticket × Ciclo por pipeline ============== */
  const pipelineScatter = useMemo(() => {
    return byPipeline
      .filter((p) => p.won > 0 && (p.avg_cycle_days ?? 0) > 0)
      .map((p) => ({
        name: p.name,
        x: Number((p.avg_cycle_days ?? 0).toFixed(1)),
        y: p.won > 0 ? Math.round(p.revenue / p.won) : 0,
        z: p.won,
      }));
  }, [byPipeline]);

  /* ============== 3. Motivo × Responsável (matriz) ==============
     Como o RPC não retorna a matriz pronta, usamos uma proxy:
     distribuímos os motivos pela participação dos usuários nos perdidos. */
  const motivoUserMatrix = useMemo(() => {
    const totalLost = byUser.reduce((s, u) => s + u.lost, 0);
    if (totalLost === 0 || byLossReason.length === 0 || byUser.length === 0) {
      return { reasons: [], users: [], cells: new Map<string, number>() };
    }
    const users = [...byUser].filter((u) => u.lost > 0).sort((a, b) => b.lost - a.lost).slice(0, 8);
    const reasons = byLossReason.slice(0, 8);
    const cells = new Map<string, number>();
    for (const r of reasons) {
      for (const u of users) {
        // Estimativa proporcional: motivo distribuído pela participação do user nas perdas
        const share = u.lost / totalLost;
        cells.set(`${r.loss_reason_id ?? r.label}__${u.user_id}`, Math.round(r.cnt * share));
      }
    }
    const max = Math.max(1, ...Array.from(cells.values()));
    return { reasons, users, cells, max };
  }, [byLossReason, byUser]);

  /* ============== 4. Performance por usuário (Conversão × Receita × Volume) ============== */
  const userScatter = useMemo(() => {
    return byUser
      .filter((u) => u.leads > 0)
      .map((u) => {
        const closed = u.won + u.lost;
        const conv = closed > 0 ? (u.won / closed) * 100 : 0;
        return {
          name: u.name,
          x: Number(conv.toFixed(1)),
          y: u.revenue,
          z: u.leads,
        };
      });
  }, [byUser]);

  return (
    <Tabs defaultValue="stage-flow" className="w-full">
      <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full">
        <TabsTrigger value="stage-flow" className="text-xs">Estágios: tempo × conv.</TabsTrigger>
        <TabsTrigger value="pipeline-mix" className="text-xs">Pipelines: ticket × ciclo</TabsTrigger>
        <TabsTrigger value="user-perf" className="text-xs">Equipe: conv. × receita</TabsTrigger>
        <TabsTrigger value="reason-user" className="text-xs">Motivos × Equipe</TabsTrigger>
      </TabsList>

      {/* ============== 1 ============== */}
      <TabsContent value="stage-flow" className="mt-4">
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
            Tempo médio × Conversão por estágio
            <InfoHint
              title="Tempo × Conversão"
              definition="Cruza o tempo médio gasto em cada estágio (barras) com o % de leads que avançam para o próximo estágio (linha). Permite identificar etapas onde leads ficam parados E também perdem conversão."
              formula="AVG(horas no estágio) e entries(N+1) / entries(N)"
            />
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Etapas com tempo alto e conversão baixa são prioridade de revisão
          </p>
          {stageInsight.length === 0 ? (
            <EmptyState title="Sem estágios suficientes" />
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={stageInsight}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} label={{ value: 'h', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} domain={[0, 100]} unit="%" />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar yAxisId="left" dataKey="Tempo" fill="hsl(var(--violet))" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="Conversão p/ próximo" stroke="hsl(var(--emerald))" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </TabsContent>

      {/* ============== 2 ============== */}
      <TabsContent value="pipeline-mix" className="mt-4">
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
            Ticket médio × Ciclo médio por pipeline
            <InfoHint
              title="Ticket × Ciclo"
              definition="Cada bolha é um pipeline. Eixo X = dias até fechar (ciclo). Eixo Y = ticket médio ganho (R$). Tamanho = nº de ganhos. Ajuda a identificar pipelines 'rápidos e baratos' vs 'longos e caros'."
              formula="x = avg_cycle_days · y = receita_won / ganhos · z = ganhos"
            />
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Quadrante superior-esquerdo = ideal (rápido e caro)</p>
          {pipelineScatter.length === 0 ? (
            <EmptyState title="Nenhum pipeline com ganhos no período" />
          ) : (
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" dataKey="x" name="Ciclo" unit="d" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="number" dataKey="y" name="Ticket" tickFormatter={(v) => formatBRL(Number(v))} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <ZAxis type="number" dataKey="z" range={[80, 400]} name="Ganhos" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => {
                      if (name === 'Ticket') return formatBRL(v);
                      if (name === 'Ciclo') return `${v}d`;
                      return v;
                    }}
                    labelFormatter={(_l, payload) => payload?.[0]?.payload?.name ?? ''}
                  />
                  <Scatter data={pipelineScatter} fill="hsl(var(--primary))" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </TabsContent>

      {/* ============== 3 ============== */}
      <TabsContent value="user-perf" className="mt-4">
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
            Conversão × Receita por responsável
            <InfoHint
              title="Conv. × Receita por responsável"
              definition="Cada bolha é um vendedor. Eixo X = % de conversão dos fechamentos. Eixo Y = receita ganha. Tamanho = nº de leads atribuídos. Identifica top performers e os que precisam de apoio."
              formula="x = won / (won + lost) · y = revenue · z = leads"
            />
          </h3>
          {userScatter.length === 0 ? (
            <EmptyState title="Sem responsáveis com leads" />
          ) : (
            <div className="h-[340px]">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 12, right: 24, bottom: 24, left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" dataKey="x" name="Conversão" unit="%" domain={[0, 100]} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="number" dataKey="y" name="Receita" tickFormatter={(v) => formatBRL(Number(v))} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <ZAxis type="number" dataKey="z" range={[80, 400]} name="Leads" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3' }}
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, name: string) => {
                      if (name === 'Receita') return formatBRL(v);
                      if (name === 'Conversão') return `${v}%`;
                      return v;
                    }}
                    labelFormatter={(_l, payload) => payload?.[0]?.payload?.name ?? ''}
                  />
                  <Scatter data={userScatter} fill="hsl(var(--violet))" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </TabsContent>

      {/* ============== 4 ============== */}
      <TabsContent value="reason-user" className="mt-4">
        <Card className="p-5">
          <h3 className="text-sm font-medium mb-1 inline-flex items-center gap-1.5">
            Motivos de perda × Responsável
            <InfoHint
              title="Motivos × Equipe"
              definition="Estimativa de quantos leads cada vendedor perdeu por motivo, ponderada pela participação do vendedor nas perdas totais. Ajuda a identificar padrões (ex: vendedor X concentra perdas por preço)."
              formula="cell ≈ motivo.cnt × (user.lost / total_lost)"
              note="Estimativa proporcional — não é a contagem exata por par."
            />
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Quanto mais escuro, mais leads perdidos no cruzamento</p>
          {motivoUserMatrix.users.length === 0 ? (
            <EmptyState title="Sem dados suficientes para o cruzamento" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 text-left font-medium">Motivo</th>
                    {motivoUserMatrix.users.map((u) => (
                      <th key={u.user_id} className="py-2 px-2 text-right font-medium tabular-nums">
                        {u.name.split(' ')[0]}
                      </th>
                    ))}
                    <th className="py-2 text-right font-medium tabular-nums">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {motivoUserMatrix.reasons.map((r) => (
                    <tr key={r.loss_reason_id ?? r.label} className="border-b border-border/40 last:border-0">
                      <td className="py-2 truncate max-w-[180px]">{r.label}</td>
                      {motivoUserMatrix.users.map((u) => {
                        const v = motivoUserMatrix.cells.get(`${r.loss_reason_id ?? r.label}__${u.user_id}`) ?? 0;
                        const intensity = motivoUserMatrix.max ? v / motivoUserMatrix.max : 0;
                        return (
                          <td key={u.user_id} className="px-1 py-1">
                            <div
                              className={cn(
                                'rounded text-right tabular-nums px-2 py-1.5',
                                v === 0 && 'text-muted-foreground/40',
                              )}
                              style={{
                                background: v > 0 ? `hsl(var(--rose) / ${(0.1 + intensity * 0.55).toFixed(2)})` : undefined,
                                color: intensity > 0.6 ? 'hsl(var(--background))' : undefined,
                              }}
                            >
                              {v}
                            </div>
                          </td>
                        );
                      })}
                      <td className="py-2 text-right font-semibold tabular-nums">{r.cnt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </TabsContent>
    </Tabs>
  );
}
