import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Crown, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RankingStars } from './RankingStars';
import type { RankingMetric, RankingRow } from '@/hooks/useRankings';
import { metricTarget, metricValue } from '@/hooks/useRankings';

function formatMetric(v: number, m: RankingMetric): string {
  if (m === 'value') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
  }
  return new Intl.NumberFormat('pt-BR').format(v);
}

function initialOf(row: RankingRow): string {
  return (row.full_name || row.email || '?').trim().charAt(0).toUpperCase();
}

/* -------------------------------------------------------------------------- */
/*  LeaderSpotlight — card horizontal premium para o 1º lugar                  */
/* -------------------------------------------------------------------------- */

export function LeaderSpotlight({
  row,
  metric,
}: {
  row: RankingRow;
  metric: RankingMetric;
}) {
  const value = metricValue(row, metric);
  const target = metricTarget(row, metric);
  const pct = target > 0 ? Math.min(150, (value / target) * 100) : 100;
  const barPct = target > 0 ? Math.min(100, pct) : 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card
        className={cn(
          'relative overflow-hidden border-zinc-800',
          'bg-[radial-gradient(ellipse_at_top_left,_hsl(var(--trophy-gold)/0.14),_transparent_60%)]',
        )}
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--trophy-gold)/0.6)] to-transparent" />

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 min-w-0">
          {/* Linha topo no mobile: avatar + identidade */}
          <div className="flex items-center gap-3 sm:contents min-w-0">
            <div className="relative shrink-0">
              <Avatar className="w-14 h-14 sm:w-16 sm:h-16 ring-2 ring-[hsl(var(--trophy-gold)/0.7)]">
                {row.avatar_url && <AvatarImage src={row.avatar_url} />}
                <AvatarFallback className="text-lg font-semibold bg-secondary">
                  {initialOf(row)}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full flex items-center justify-center bg-card border border-border text-[hsl(var(--trophy-gold))]">
                <Crown className="w-3.5 h-3.5" />
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 min-w-0">
                <span className="text-[10px] uppercase tracking-[0.14em] text-[hsl(var(--trophy-gold))] font-semibold shrink-0">
                  1º Lugar
                </span>
                <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                  · Líder do período
                </span>
              </div>
              <p className="font-semibold text-sm truncate">{row.full_name || 'Sem nome'}</p>
              <p className="text-[11px] text-muted-foreground truncate">{row.email}</p>
            </div>
          </div>

          {/* Valor: full-width no mobile, à direita no desktop */}
          <div className="text-left sm:text-right min-w-0 sm:max-w-[45%] sm:shrink-0">
            <p className="text-xl sm:text-2xl font-bold text-[hsl(var(--trophy-gold))] tabular-nums truncate">
              {formatMetric(value, metric)}
            </p>
            <RankingStars pct={pct} className="justify-start sm:justify-end mt-1" />
          </div>
        </div>

        {target > 0 && (
          <div className="px-4 pb-4 -mt-1">
            <Progress value={barPct} className="h-1.5" />
            <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
              {Math.round(pct)}% da meta ({formatMetric(target, metric)})
            </p>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  MiniPodium — cards iguais para 2º e 3º                                     */
/* -------------------------------------------------------------------------- */

const MEDAL_STYLES = {
  2: {
    label: '2º Lugar',
    ring: 'ring-[hsl(var(--trophy-silver)/0.7)]',
    text: 'text-[hsl(var(--trophy-silver))]',
    glow: 'bg-[radial-gradient(ellipse_at_top,_hsl(var(--trophy-silver)/0.1),_transparent_70%)]',
  },
  3: {
    label: '3º Lugar',
    ring: 'ring-[hsl(var(--trophy-bronze)/0.7)]',
    text: 'text-[hsl(var(--trophy-bronze))]',
    glow: 'bg-[radial-gradient(ellipse_at_top,_hsl(var(--trophy-bronze)/0.1),_transparent_70%)]',
  },
} as const;

function MedalCard({
  row,
  position,
  metric,
  delay,
}: {
  row: RankingRow;
  position: 2 | 3;
  metric: RankingMetric;
  delay: number;
}) {
  const value = metricValue(row, metric);
  const style = MEDAL_STYLES[position];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }}
      className="h-full"
    >
      <Card className={cn('relative overflow-hidden border-zinc-800 p-3 h-full', style.glow)}>
        <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-3 min-w-0 h-full">
          {/* Avatar */}
          <div className="relative shrink-0">
            <Avatar className={cn('w-12 h-12 sm:w-11 sm:h-11 ring-2', style.ring)}>
              {row.avatar_url && <AvatarImage src={row.avatar_url} />}
              <AvatarFallback className="text-sm font-semibold bg-secondary">
                {initialOf(row)}
              </AvatarFallback>
            </Avatar>
            <span
              className={cn(
                'absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center bg-card border border-border',
                style.text,
              )}
            >
              <Trophy className="w-2.5 h-2.5" />
            </span>
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 text-center sm:text-left">
            <span className={cn('text-[9px] uppercase tracking-[0.14em] font-semibold', style.text)}>
              {style.label}
            </span>
            <p className="font-medium text-sm truncate">{row.full_name || 'Sem nome'}</p>
            <p className={cn('text-base font-bold tabular-nums truncate', style.text)}>
              {formatMetric(value, metric)}
            </p>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

export function MiniPodium({
  rows,
  metric,
}: {
  rows: RankingRow[];
  metric: RankingMetric;
}) {
  const second = rows[1];
  const third = rows[2];
  if (!second && !third) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {second && <MedalCard row={second} position={2} metric={metric} delay={0.05} />}
      {third && <MedalCard row={third} position={3} metric={metric} delay={0.12} />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Compat shim: mantém RankingPodium para callers legados (RankingsTab)       */
/* -------------------------------------------------------------------------- */

export function RankingPodium({ rows, metric }: { rows: RankingRow[]; metric: RankingMetric }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-3">
      <LeaderSpotlight row={rows[0]} metric={metric} />
      <MiniPodium rows={rows} metric={metric} />
    </div>
  );
}
