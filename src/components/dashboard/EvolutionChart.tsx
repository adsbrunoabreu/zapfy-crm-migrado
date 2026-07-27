import { Card } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { InfoHint } from './InfoHint';

interface Props {
  data: { label: string; count: number }[];
  title?: string;
}

export function EvolutionChart({ data, title = 'Evolução de Leads' }: Props) {
  const total = data.reduce((s, d) => s + d.count, 0);
  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
            {title}
            <InfoHint
              title="Evolução de leads"
              definition="Quantos leads foram criados em cada bucket (hora ou dia) dentro do período selecionado."
              formula="COUNT(leads) por bucket de tempo"
            />
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{total} leads no período</p>
        </div>
      </div>
      <div className="h-[260px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="evoFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={20}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: 'hsl(var(--border))', strokeWidth: 1 }}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                color: 'hsl(var(--foreground))',
                fontSize: 12,
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              formatter={(v: number) => [v, 'Leads']}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              fill="url(#evoFill)"
              animationDuration={600}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
