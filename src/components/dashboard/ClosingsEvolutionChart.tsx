import { Card } from '@/components/ui/card';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { InfoHint } from './InfoHint';

interface Props {
  data: { label: string; closedWon: number; closedLost: number; reopened?: number }[];
}

export function ClosingsEvolutionChart({ data }: Props) {
  const totalWon = data.reduce((s, d) => s + d.closedWon, 0);
  const totalLost = data.reduce((s, d) => s + d.closedLost, 0);
  const totalReopened = data.reduce((s, d) => s + (d.reopened || 0), 0);
  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
            Fechamentos & Reaberturas
            <InfoHint
              title="Fechamentos & Reaberturas"
              definition="Leads ganhos e perdidos por bucket (closed_at) e linha de eventos de reabertura no mesmo eixo de tempo."
              formula="Won/Lost: COUNT(leads) por closed_at ∈ bucket · Reaberturas: COUNT(lead_activities WHERE action_type='lead_reopened')"
              note="Mostra a saída do pipeline e quantos leads voltaram para fluxo ativo."
            />
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalWon} ganhos · {totalLost} perdidos · {totalReopened} reaberturas
          </p>
        </div>
      </div>
      <div className="h-[260px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -20 }}>
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
              cursor={{ fill: 'hsl(var(--muted) / 0.4)' }}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                color: 'hsl(var(--foreground))',
                fontSize: 12,
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="closedWon" name="Ganhos" stackId="a" fill="hsl(var(--emerald))" radius={[0, 0, 0, 0]} />
            <Bar dataKey="closedLost" name="Perdidos" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            <Line
              type="monotone"
              dataKey="reopened"
              name="Reaberturas"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={{ r: 3, fill: 'hsl(var(--primary))' }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

