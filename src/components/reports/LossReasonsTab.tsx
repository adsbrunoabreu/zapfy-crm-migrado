import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LossReasonsCard } from '@/components/dashboard/LossReasonsCard';
import { formatBRL } from '@/lib/format';
import type { PipelineByLossReason, PipelineLossReasonDaily } from '@/hooks/usePipelinePerformance';

interface Props {
  rows: PipelineByLossReason[];
  daily: PipelineLossReasonDaily[];
}

const COLORS = [
  'hsl(var(--rose))',
  'hsl(var(--amber))',
  'hsl(var(--violet))',
  'hsl(var(--cyan))',
  'hsl(var(--emerald))',
  'hsl(var(--primary))',
];

export function LossReasonsTab({ rows, daily }: Props) {
  const labels = useMemo(() => Array.from(new Set(daily.map((d) => d.label))), [daily]);

  const dailyChart = useMemo(() => {
    const byDay = new Map<string, Record<string, number | string>>();
    for (const d of daily) {
      const key = d.day;
      if (!byDay.has(key)) byDay.set(key, { day: format(new Date(key), 'dd/MM', { locale: ptBR }) });
      byDay.get(key)![d.label] = d.cnt;
    }
    return Array.from(byDay.values());
  }, [daily]);

  // Adapter para o LossReasonsCard do dashboard
  const cardReasons = useMemo(
    () => rows.map((r) => ({
      reason_id: r.loss_reason_id,
      label: r.label,
      count: r.cnt,
      total_value: r.value_sum,
      percentage: r.pct,
    })),
    [rows],
  );
  const totalLost = rows.reduce((s, r) => s + r.cnt, 0);
  const totalLostValue = rows.reduce((s, r) => s + r.value_sum, 0);

  if (rows.length === 0) {
    return <Card className="p-6"><EmptyState title="Nenhum lead perdido com motivo no período" /></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <LossReasonsCard
          reasons={cardReasons}
          totalLost={totalLost}
          totalLostValue={totalLostValue}
        />

        <Card className="p-5">
          <h3 className="text-sm font-medium mb-1">Evolução dos motivos no tempo</h3>
          <p className="text-xs text-muted-foreground mb-4">Identifica picos atípicos por motivo</p>
          {dailyChart.length === 0 ? (
            <EmptyState title="Sem variação no período" />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {labels.map((label, i) => (
                    <Line key={label} type="monotone" dataKey={label} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-medium mb-4">Detalhamento por motivo</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border text-xs uppercase text-muted-foreground">
                <th className="py-2 font-medium">Motivo</th>
                <th className="py-2 font-medium tabular-nums text-right">Qtd</th>
                <th className="py-2 font-medium tabular-nums text-right">%</th>
                <th className="py-2 font-medium tabular-nums text-right">Valor potencial</th>
                <th className="py-2 font-medium tabular-nums text-right">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.loss_reason_id ?? '_'}-${i}`} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                      {r.label}
                    </div>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{r.cnt}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">{r.pct}%</td>
                  <td className="py-2.5 text-right tabular-nums">{formatBRL(r.value_sum)}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted-foreground">{r.avg_value ? formatBRL(r.avg_value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
