import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Area, ComposedChart } from 'recharts';
import type { CompanyGrowthPoint } from '@/hooks/useMasterDashboardData';
import { InfoHint } from './InfoHint';

export function CompanyGrowthChart({ data }: { data: CompanyGrowthPoint[] }) {
  return (
    <Card className="animate-fade-in h-full w-full min-w-0 flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-1.5">
          Crescimento de empresas
          <InfoHint
            title="Crescimento de empresas"
            definition="Empresas novas cadastradas por bucket (linha) e total acumulado da plataforma (área)."
            formula="Novas = COUNT(companies WHERE created_at no bucket); Acumulado = soma corrente"
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-[18rem] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="cgGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
            <RTooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
              formatter={(v: number, n: string) => [v, n === 'acumulado' ? 'Total acumulado' : 'Novas']}
            />
            <Area type="monotone" dataKey="acumulado" stroke="hsl(var(--primary))" strokeWidth={2}
              fill="url(#cgGrad)" animationDuration={600} dot={{ r: 3, fill: 'hsl(var(--primary))' }} />
            <Line type="monotone" dataKey="novas" stroke="hsl(var(--chart-3))" strokeWidth={1.5}
              dot={false} animationDuration={600} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
