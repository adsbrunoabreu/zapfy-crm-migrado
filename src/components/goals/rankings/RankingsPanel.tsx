import { Card } from '@/components/ui/card';
import { Loader2, Trophy, Users } from 'lucide-react';
import { useRankings, metricValue, type RankingMetric } from '@/hooks/useRankings';
import { LeaderSpotlight, MiniPodium } from './RankingPodium';
import { RankingTable } from './RankingTable';
import { useMemo } from 'react';

interface Props {
  start: string;
  end: string;
  metric: RankingMetric;
  search: string;
}

export function RankingsPanel({ start, end, metric, search }: Props) {
  const { data: rows = [], isLoading } = useRankings(start, end);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = term
      ? rows.filter((r) =>
          (r.full_name || '').toLowerCase().includes(term) ||
          (r.email || '').toLowerCase().includes(term),
        )
      : rows;
    return [...base].sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
  }, [rows, metric, search]);

  const leader = filtered[0];
  const rest = filtered.slice(3);

  return (
    <Card className="glass-card flex flex-col h-full min-w-0">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <Trophy className="w-4 h-4 text-[hsl(var(--trophy-gold))] shrink-0" />
          <h2 className="font-semibold text-sm truncate">Ranking da equipe</h2>
        </div>
        {filtered.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
            <Users className="w-3 h-3" />
            {filtered.length} {filtered.length === 1 ? 'participante' : 'participantes'}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 min-w-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16">
            <Trophy className="w-10 h-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium mb-1">Sem dados no período</p>
            <p className="text-xs text-muted-foreground">
              Quando seus agentes movimentarem leads, eles aparecerão aqui.
            </p>
          </div>
        ) : (
          <>
            {leader && <LeaderSpotlight row={leader} metric={metric} />}
            <MiniPodium rows={filtered} metric={metric} />
            {rest.length > 0 && (
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-2 px-1">
                  Demais colocados
                </p>
                <RankingTable rows={rest} metric={metric} />
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
