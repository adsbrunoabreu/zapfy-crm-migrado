import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type KpiTone = 'primary' | 'emerald' | 'rose' | 'amber' | 'cyan' | 'violet' | 'muted';

interface KpiCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: KpiTone;
  active?: boolean;
  onClick?: () => void;
  iconSpin?: boolean;
  className?: string;
}

const TONE_TEXT: Record<KpiTone, string> = {
  primary: 'text-primary',
  emerald: 'text-[hsl(var(--emerald))]',
  rose:    'text-[hsl(var(--rose))]',
  amber:   'text-[hsl(var(--amber))]',
  cyan:    'text-[hsl(var(--cyan))]',
  violet:  'text-[hsl(var(--violet))]',
  muted:   'text-primary',
};
const TONE_BG: Record<KpiTone, string> = {
  primary: 'bg-primary/10',
  emerald: 'bg-[hsl(var(--emerald))]/10',
  rose:    'bg-[hsl(var(--rose))]/10',
  amber:   'bg-[hsl(var(--amber))]/10',
  cyan:    'bg-[hsl(var(--cyan))]/10',
  violet:  'bg-[hsl(var(--violet))]/10',
  muted:   'bg-primary/10',
};

/**
 * Padrão visual unificado (igual ao MetricCard / StatCard):
 * - label: text-xs muted no topo
 * - valor: text-2xl font-semibold tabular-nums
 * - ícone: 16px em chip 28x28 no canto superior direito
 */
export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  active = false,
  onClick,
  iconSpin = false,
  className,
}: KpiCardProps) {
  const Comp: any = onClick ? 'button' : 'div';

  return (
    <Comp
      onClick={onClick}
      className={cn(
        'rounded-lg border bg-card p-4 text-left w-full transition-colors',
        onClick && 'hover:bg-muted/40 cursor-pointer',
        active ? 'border-foreground/30 ring-1 ring-foreground/10' : 'border-border',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <span className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', TONE_BG[tone])}>
          <Icon className={cn('h-4 w-4', TONE_TEXT[tone], iconSpin && 'animate-spin')} />
        </span>
      </div>
      <p className="text-2xl font-semibold tabular-nums text-foreground mt-1">{value}</p>
    </Comp>
  );
}
