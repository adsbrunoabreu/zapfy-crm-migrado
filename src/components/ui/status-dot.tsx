import { cn } from '@/lib/utils';

type StatusTone = 'active' | 'pending' | 'inactive' | 'error' | 'info';

const TONE: Record<StatusTone, string> = {
  active: 'bg-emerald',
  pending: 'bg-amber',
  inactive: 'bg-muted-foreground/50',
  error: 'bg-destructive',
  info: 'bg-cyan',
};

interface StatusDotProps {
  tone?: StatusTone;
  label?: string;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Dot colorido + texto, usado para status em tabelas e listas.
 * Evita Badge com background colorido.
 */
export function StatusDot({ tone = 'inactive', label, className, size = 'sm' }: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'rounded-full shrink-0',
          size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
          TONE[tone],
        )}
      />
      {label && <span className="text-sm text-foreground">{label}</span>}
    </span>
  );
}
