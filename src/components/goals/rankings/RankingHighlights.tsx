import { Card } from '@/components/ui/card';
import { Flame, Sparkles, TrendingUp } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import type { RankingMetric, RankingRow } from '@/hooks/useRankings';
import { metricPrev, metricValue } from '@/hooks/useRankings';

function format(v: number, m: RankingMetric): string {
  if (m === 'value') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  }
  return new Intl.NumberFormat('pt-BR').format(v);
}

function AvatarSmall({ row }: { row: RankingRow }) {
  const initial = (row.full_name || row.email || '?').trim().charAt(0).toUpperCase();
  return (
    <Avatar className="w-9 h-9">
      {row.avatar_url && <AvatarImage src={row.avatar_url} />}
      <AvatarFallback className="text-sm bg-secondary">{initial}</AvatarFallback>
    </Avatar>
  );
}

function HighlightCard({
  title,
  icon: Icon,
  iconClass,
  row,
  caption,
}: {
  title: string;
  icon: React.ElementType;
  iconClass: string;
  row: RankingRow | null;
  caption: string;
}) {
  return (
    <Card className="p-4 border-zinc-800">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={cn('w-4 h-4', iconClass)} />
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{title}</p>
      </div>
      {row ? (
        <div className="flex items-center gap-3">
          <AvatarSmall row={row} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate">{row.full_name || row.email}</p>
            <p className="text-xs text-muted-foreground truncate">{caption}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sem dados no período.</p>
      )}
    </Card>
  );
}

export function RankingHighlights({
  rows,
  metric,
  periodStart,
}: {
  rows: RankingRow[];
  metric: RankingMetric;
  periodStart: string;
}) {
  // Maior crescimento vs período anterior
  const sortedByGrowth = [...rows]
    .map((r) => {
      const curr = metricValue(r, metric);
      const prev = metricPrev(r, metric);
      const growth = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : -Infinity;
      return { r, curr, prev, growth };
    })
    .filter((x) => x.curr > 0)
    .sort((a, b) => b.growth - a.growth);

  const topGrowth = sortedByGrowth[0] || null;

  // Mais consistente: maior valor com menor delta absoluto (estável + produtivo)
  const consistent = [...rows]
    .map((r) => {
      const curr = metricValue(r, metric);
      const prev = metricPrev(r, metric);
      const stability = curr > 0 ? curr - Math.abs(curr - prev) : -1;
      return { r, curr, stability };
    })
    .filter((x) => x.curr > 0)
    .sort((a, b) => b.stability - a.stability)[0] || null;

  // Estreante do período: profile criado dentro do período
  const periodStartDate = new Date(periodStart);
  const rookies = [...rows]
    .filter((r) => new Date(r.joined_at) >= periodStartDate)
    .sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
  const rookie = rookies[0] || null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <HighlightCard
        title="Maior crescimento"
        icon={TrendingUp}
        iconClass="text-emerald"
        row={topGrowth?.r ?? null}
        caption={
          topGrowth
            ? `+${Math.round(topGrowth.growth)}% vs período anterior · ${format(topGrowth.curr, metric)}`
            : ''
        }
      />
      <HighlightCard
        title="Mais consistente"
        icon={Flame}
        iconClass="text-amber"
        row={consistent?.r ?? null}
        caption={consistent ? `${format(consistent.curr, metric)} mantendo ritmo` : ''}
      />
      <HighlightCard
        title="Estreante do período"
        icon={Sparkles}
        iconClass="text-cyan"
        row={rookie}
        caption={rookie ? `${format(metricValue(rookie, metric), metric)} no primeiro período` : ''}
      />
    </div>
  );
}
