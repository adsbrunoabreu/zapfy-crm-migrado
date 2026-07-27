import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, TrendingUp, TrendingDown, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Insight { type: string; message: string }

export function DREInsights({ data, loading }: { data: Insight[]; loading?: boolean }) {
  if (loading) return <Card className="p-4"><Skeleton className="h-16" /></Card>;
  if (!data || data.length === 0) {
    return (
      <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="w-4 h-4" /> Sem insights gerados para este período.
      </Card>
    );
  }
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-primary" />
        <h4 className="text-sm font-semibold">Insights automáticos</h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {data.map((it, i) => {
          const Icon = it.type === 'positive' ? TrendingUp
            : it.type === 'negative' ? TrendingDown
            : it.type === 'warning' ? AlertTriangle : Info;
          const tone = it.type === 'positive' ? 'text-emerald'
            : it.type === 'negative' ? 'text-rose'
            : it.type === 'warning' ? 'text-amber' : 'text-cyan';
          return (
            <div key={i} className="flex items-start gap-2 rounded-md bg-secondary/40 px-3 py-2">
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', tone)} />
              <span className="text-xs leading-relaxed">{it.message}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
