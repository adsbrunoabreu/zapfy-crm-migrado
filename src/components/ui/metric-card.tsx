import { ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Ícone opcional 18px no canto superior direito (apenas muted) */
  icon?: ReactNode;
  /**
   * Variação % vs período anterior. Positivo verde, negativo vermelho.
   * Renderizado como microtexto abaixo do valor.
   */
  delta?: {
    value: number;
    label?: string;
  };
  className?: string;
}

/**
 * Card de métrica padrão SaaS (Linear/Stripe):
 * - label text-xs muted
 * - valor text-2xl font-semibold (sem cor forte)
 * - ícone opcional muted no topo direito
 * - delta opcional (verde/vermelho) abaixo do valor
 */
export function MetricCard({ label, value, icon, delta, className }: MetricCardProps) {
  const isUp = delta && delta.value > 0;
  const isDown = delta && delta.value < 0;

  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {icon && (
          <span className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0 [&>svg]:h-[16px] [&>svg]:w-[16px]">
            {icon}
          </span>
        )}
      </div>
      <p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">{value}</p>
      {delta && (
        <p
          className={cn(
            'text-xs mt-1 flex items-center gap-1 tabular-nums',
            isUp && 'text-emerald',
            isDown && 'text-destructive',
            !isUp && !isDown && 'text-muted-foreground',
          )}
        >
          {isUp && <ArrowUp className="h-3 w-3" />}
          {isDown && <ArrowDown className="h-3 w-3" />}
          {Math.abs(delta.value).toFixed(1)}%
          {delta.label && <span className="text-muted-foreground ml-1">{delta.label}</span>}
        </p>
      )}
    </div>
  );
}
