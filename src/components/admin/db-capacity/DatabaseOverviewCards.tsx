import { Database, HardDrive, Plug, Trash2 } from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes, formatNumber, type DatabaseOverview } from '@/hooks/useDbCapacity';

interface Props {
  overview?: DatabaseOverview;
  totalMediaBytes?: number;
  loading?: boolean;
}

export function DatabaseOverviewCards({ overview, totalMediaBytes, loading }: Props) {
  if (loading || !overview) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard
        label="Tamanho total do banco"
        value={formatBytes(overview.total_bytes)}
        icon={<Database />}
      />
      <MetricCard
        label="Storage de mídia"
        value={formatBytes(totalMediaBytes ?? 0)}
        icon={<HardDrive />}
      />
      <MetricCard
        label="Tabelas (public)"
        value={formatNumber(overview.table_count)}
        icon={<Database />}
      />
      <MetricCard
        label="Conexões ativas"
        value={formatNumber(overview.active_connections)}
        icon={<Plug />}
      />
      <MetricCard
        label="Dead tuples (total)"
        value={formatNumber(overview.dead_tuples_total)}
        icon={<Trash2 />}
        className="lg:col-span-1"
      />
    </div>
  );
}
