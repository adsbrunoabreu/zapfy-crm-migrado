import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBRL } from '@/lib/format';
import type { MedicalDoctorPerformance } from '@/hooks/medical/useMedicalDashboardSeries';

interface Props {
  data: MedicalDoctorPerformance[];
  isLoading?: boolean;
}

export function DoctorPerformanceTable({ data, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-[200px] w-full" />
      </Card>
    );
  }

  if (!data.length) {
    return (
      <Card className="p-6 h-full flex flex-col">
        <h3 className="text-base font-semibold text-foreground mb-2">Performance dos médicos</h3>
        <p className="text-xs text-muted-foreground">Nenhum médico ativo no período.</p>
      </Card>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => Number(d.revenue || 0)), 1);

  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-foreground">Performance dos médicos</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Top 10 por receita no período</p>
      </div>
      <div className="space-y-3">
        {data.map((d) => {
          const revenue = Number(d.revenue || 0);
          const pct = (revenue / maxRevenue) * 100;
          const noShowRate =
            d.appointments + d.no_shows > 0
              ? (d.no_shows / (d.appointments + d.no_shows)) * 100
              : 0;
          return (
            <div key={d.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-foreground truncate">{d.name}</span>
                <div className="flex items-center gap-3 shrink-0 text-muted-foreground">
                  <span>
                    {d.appointments} cons.
                    {d.no_shows > 0 && (
                      <span className="ml-1 text-destructive">· {noShowRate.toFixed(0)}% falta</span>
                    )}
                  </span>
                  <span className="font-mono text-foreground tabular-nums">{formatBRL(revenue)}</span>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className="h-full bg-primary/80 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
