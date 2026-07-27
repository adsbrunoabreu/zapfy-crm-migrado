import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PositionBadge } from './TrophyBadge';
import { RankingStars } from './RankingStars';
import type { RankingMetric, RankingRow } from '@/hooks/useRankings';
import { metricPrev, metricTarget, metricValue } from '@/hooks/useRankings';

function formatMetric(v: number, m: RankingMetric): string {
  if (m === 'value') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  }
  return new Intl.NumberFormat('pt-BR').format(v);
}

function deltaPct(curr: number, prev: number): number | null {
  if (prev <= 0) return curr > 0 ? 100 : null;
  return ((curr - prev) / prev) * 100;
}

export function RankingTable({ rows, metric }: { rows: RankingRow[]; metric: RankingMetric }) {
  const leaderValue = rows.length > 0 ? metricValue(rows[0], metric) : 0;

  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center border-zinc-800">
        <p className="text-muted-foreground">Nenhum dado para o período selecionado.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border-zinc-800">
      <div className="divide-y divide-border/50">
        {rows.map((row, idx) => {
          const position = idx + 1;
          const value = metricValue(row, metric);
          const prev = metricPrev(row, metric);
          const target = metricTarget(row, metric);
          const targetPct = target > 0 ? Math.min(150, (value / target) * 100) : 0;
          const leaderPct = leaderValue > 0 ? (value / leaderValue) * 100 : 0;
          const barPct = target > 0 ? Math.min(100, targetPct) : leaderPct;
          const delta = deltaPct(value, prev);
          const initial = (row.full_name || row.email || '?').trim().charAt(0).toUpperCase();

          return (
            <div
              key={row.user_id}
              className={cn(
                'grid grid-cols-12 gap-3 items-center px-4 py-3 hover:bg-secondary/30 transition-colors',
                position === 1 && 'bg-[hsl(var(--trophy-gold)/0.04)]',
              )}
            >
              <div className="col-span-1 flex justify-center">
                <PositionBadge position={position} />
              </div>
              <div className="col-span-4 md:col-span-3 flex items-center gap-3 min-w-0">
                <Avatar className="w-9 h-9 shrink-0">
                  {row.avatar_url && <AvatarImage src={row.avatar_url} />}
                  <AvatarFallback className="text-sm bg-secondary">{initial}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="font-medium truncate text-sm">{row.full_name || 'Sem nome'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{row.email}</p>
                </div>
              </div>

              <div className="col-span-4 hidden md:block">
                <Progress value={barPct} className="h-2" />
                <p className="text-[11px] text-muted-foreground mt-1">
                  {target > 0
                    ? `${Math.round(targetPct)}% da meta (${formatMetric(target, metric)})`
                    : `${Math.round(leaderPct)}% do líder`}
                </p>
              </div>

              <div className="col-span-4 md:col-span-2 text-right">
                <p className="font-semibold text-sm md:text-base">{formatMetric(value, metric)}</p>
                {delta !== null && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-[11px]',
                      delta > 0
                        ? 'text-emerald'
                        : delta < 0
                          ? 'text-destructive'
                          : 'text-muted-foreground',
                    )}
                  >
                    {delta > 0 ? (
                      <ArrowUp className="w-3 h-3" />
                    ) : delta < 0 ? (
                      <ArrowDown className="w-3 h-3" />
                    ) : (
                      <Minus className="w-3 h-3" />
                    )}
                    {Math.abs(Math.round(delta))}%
                  </span>
                )}
              </div>

              <div className="col-span-3 md:col-span-2 flex justify-end">
                <RankingStars pct={target > 0 ? targetPct : leaderPct} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
