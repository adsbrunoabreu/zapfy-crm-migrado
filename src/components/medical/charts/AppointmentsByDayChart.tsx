import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { MedicalDailyPoint } from '@/hooks/medical/useMedicalDashboardSeries';

interface Props {
  data: MedicalDailyPoint[];
  isLoading?: boolean;
}

export function AppointmentsByDayChart({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-[260px] w-full" />
      </Card>
    );
  }

  const totals = data.reduce(
    (acc, d) => ({
      total: acc.total + Number(d.total || 0),
      completed: acc.completed + Number(d.completed || 0),
      no_show: acc.no_show + Number(d.no_show || 0),
    }),
    { total: 0, completed: 0, no_show: 0 },
  );
  const noShowRate = totals.total > 0 ? (totals.no_show / totals.total) * 100 : 0;

  const chartData = data.map((d) => ({
    ...d,
    label: format(parseISO(d.date), 'dd/MM', { locale: ptBR }),
  }));

  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-foreground">Agendamentos por dia</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totals.total} no período · <span className="text-foreground">{totals.completed}</span> concluídos · taxa de falta <span className="text-destructive">{noShowRate.toFixed(1)}%</span>
          </p>
        </div>
      </div>
      <div className="h-[260px] sm:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }} barCategoryGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
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
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}
            />
            <Bar dataKey="completed" name="Concluídos" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
            <Bar dataKey="no_show" name="Faltas" stackId="a" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="cancelled" name="Cancelados" stackId="a" fill="hsl(var(--muted-foreground) / 0.4)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
