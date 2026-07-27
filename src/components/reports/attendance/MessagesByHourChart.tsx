import { useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { useAttendanceMessagesByHour } from '@/hooks/useAttendanceMessagesByHour';

interface Props {
  from: Date;
  to: Date;
  companyId?: string;
  agentId?: string;
}

export function MessagesByHourChart({ from, to, companyId, agentId }: Props) {
  const { data, isLoading } = useAttendanceMessagesByHour({ from, to, companyId, agentId });

  const chartData = useMemo(
    () => (data?.by_hour ?? []).map(p => ({
      hour: `${String(p.hour).padStart(2, '0')}h`,
      Clientes: p.inbound,
      Agentes: p.outbound,
    })),
    [data?.by_hour]
  );

  const hasData = chartData.some(d => d.Clientes > 0 || d.Agentes > 0);

  const periodLabel = useMemo(() => {
    const f = format(from, 'dd/MM', { locale: ptBR });
    const t = format(to, 'dd/MM', { locale: ptBR });
    return f === t ? f : `${f} – ${t}`;
  }, [from, to]);

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h3 className="text-sm font-medium">Volume de mensagens por hora</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Picos de demanda no dia · {periodLabel}
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-[260px] w-full rounded-md" />
      ) : !hasData ? (
        <EmptyState title="Sem mensagens no período" />
      ) : (
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Clientes" stackId="msg" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Agentes" stackId="msg" fill="hsl(var(--emerald-500, 142 71% 45%))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
