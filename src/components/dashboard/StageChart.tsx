import { Card } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import type { StageBreakdown } from '@/hooks/useDashboardData';
import { InfoHint } from './InfoHint';

interface Props { stages: StageBreakdown[]; }

export function StageChart({ stages }: Props) {
  const total = stages.reduce((s, x) => s + x.count, 0);
  const data = [...stages]
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(s => ({
      ...s,
      labelText: total > 0 ? `${s.count} (${Math.round((s.count / total) * 100)}%)` : `${s.count}`,
    }));

  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
          Leads por Estágio
          <InfoHint
            title="Leads por estágio"
            definition="Distribuição dos leads do período entre os estágios do funil."
            formula="COUNT(leads) agrupado por status"
          />
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">Distribuição no período</p>
      </div>
      <div className="h-[240px]">
        {data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Nenhum lead no período
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                dataKey="label"
                type="category"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={90}
              />
              <Tooltip
                cursor={{ fill: 'hsl(var(--secondary) / 0.4)' }}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [v, 'Leads']}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]} animationDuration={600}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
                <LabelList
                  dataKey="labelText"
                  position="right"
                  style={{ fontSize: 11, fill: 'hsl(var(--foreground))', fontWeight: 500 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
