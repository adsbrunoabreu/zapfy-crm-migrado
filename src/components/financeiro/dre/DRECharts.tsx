import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts';
import { DRE_LABEL, GROUP_SECTIONS, type DreReport } from '@/lib/dre';
import { formatBRL } from '@/lib/finance';

interface Props { current?: DreReport; previous?: DreReport; loading?: boolean }

export function DRECharts({ current, previous, loading }: Props) {
  const despesasData = useMemo(() => {
    if (!current) return [];
    return GROUP_SECTIONS.despesas_operacionais
      .map((s) => ({ name: DRE_LABEL[s], value: Number(current.sections[s] ?? 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [current]);

  const receitaData = useMemo(() => {
    if (!current) return [];
    return GROUP_SECTIONS.receita_bruta
      .map((s) => ({ name: DRE_LABEL[s], value: Number(current.sections[s] ?? 0) }))
      .filter((x) => x.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [current]);

  if (loading) return <Card className="p-4"><Skeleton className="h-80" /></Card>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-3">Receita por origem</h4>
        {receitaData.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={receitaData} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatBRL(Number(v))} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
              <Tooltip formatter={(v: any) => formatBRL(Number(v))} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
              <Bar dataKey="value" fill="hsl(var(--emerald))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card className="p-4">
        <h4 className="text-sm font-semibold mb-3">Despesas por categoria</h4>
        {despesasData.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem despesas no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={despesasData} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatBRL(Number(v))} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
              <Tooltip formatter={(v: any) => formatBRL(Number(v))} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', fontSize: 12 }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {despesasData.map((_, i) => <Cell key={i} fill="hsl(var(--rose))" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  );
}
