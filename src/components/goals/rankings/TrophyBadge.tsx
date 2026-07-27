import { Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';

type Position = 1 | 2 | 3;

const styles: Record<Position, { wrap: string; ring: string; label: string }> = {
  1: {
    wrap: 'bg-[hsl(var(--trophy-gold)/0.15)] text-[hsl(var(--trophy-gold))]',
    ring: 'ring-2 ring-[hsl(var(--trophy-gold)/0.6)]',
    label: 'Ouro',
  },
  2: {
    wrap: 'bg-[hsl(var(--trophy-silver)/0.15)] text-[hsl(var(--trophy-silver))]',
    ring: 'ring-2 ring-[hsl(var(--trophy-silver)/0.6)]',
    label: 'Prata',
  },
  3: {
    wrap: 'bg-[hsl(var(--trophy-bronze)/0.15)] text-[hsl(var(--trophy-bronze))]',
    ring: 'ring-2 ring-[hsl(var(--trophy-bronze)/0.6)]',
    label: 'Bronze',
  },
};

export function TrophyBadge({
  position,
  size = 'md',
  showLabel = false,
  className,
}: {
  position: Position;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}) {
  const s = styles[position];
  const sz = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-6 h-6' : 'w-9 h-9';
  const icon = size === 'lg' ? 'w-6 h-6' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span className={cn('rounded-full flex items-center justify-center', sz, s.wrap, s.ring)}>
        <Trophy className={icon} />
      </span>
      {showLabel && <span className="text-xs font-medium">{s.label}</span>}
    </div>
  );
}

export function PositionBadge({ position, className }: { position: number; className?: string }) {
  if (position <= 3) return <TrophyBadge position={position as Position} size="sm" className={className} />;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-secondary-foreground text-xs font-semibold',
        className,
      )}
    >
      {position}
    </span>
  );
}
