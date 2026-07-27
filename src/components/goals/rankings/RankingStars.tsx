import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function RankingStars({
  pct,
  size = 'sm',
  className,
}: {
  /** percentage 0-100+ */
  pct: number;
  size?: 'sm' | 'md';
  className?: string;
}) {
  // 5 stars: 1 star per 20% reached, capped at 5
  const stars = Math.max(0, Math.min(5, Math.round((pct / 100) * 5)));
  const sz = size === 'md' ? 'w-4 h-4' : 'w-3.5 h-3.5';
  return (
    <div className={cn('inline-flex items-center gap-0.5', className)}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            sz,
            i < stars
              ? 'fill-[hsl(var(--trophy-gold))] text-[hsl(var(--trophy-gold))]'
              : 'text-muted-foreground/40',
          )}
        />
      ))}
    </div>
  );
}
