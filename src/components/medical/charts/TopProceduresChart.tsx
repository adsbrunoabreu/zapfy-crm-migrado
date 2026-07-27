import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { formatBRL } from '@/lib/format';
import type { MedicalTopProcedure } from '@/hooks/medical/useMedicalDashboardSeries';

interface Props {
  data: MedicalTopProcedure[];
  isLoading?: boolean;
}

export function TopProceduresChart({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-[260px] w-full" />
      </Card>
    );
  }

  if (!data.length) {
    return (
      <Card className="p-6 h-full flex flex-col">
        <h3 className="text-base font-semibold text-foreground mb-2">Top procedimentos</h3>
        <p className="text-xs text-muted-foreground">Nenhum procedimento concluído no período.</p>
      </Card>
    );
  }

  const chartData = [...data]
    .sort((a, b) => Number(b.count) - Number(a.count))
    .slice(0, 8)
    .map((p) => ({
      ...p,
      shortName: p.name.length > 22 ? `${p.name.slice(0, 22)}…` : p.name,
    }));

  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full max-h-[360px] flex flex-col">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Top procedimentos</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Por execuções concluídas no período</p>
      </div>
      <div className="h-[260px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 0, left: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <YAxis
              type="category"
              dataKey="shortName"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              width={130}
            />
            <Tooltip
              cursor={{ fill: 'hsl(var(--muted) / 0.15)' }}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                color: 'hsl(var(--foreground))',
                fontSize: 12,
              }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: 11 }}
              formatter={(value: number, key: string) =>
                key === 'revenue' ? [formatBRL(value), 'Receita'] : [value, 'Execuções']
              }
            />
            <Bar dataKey="count" name="Execuções" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
