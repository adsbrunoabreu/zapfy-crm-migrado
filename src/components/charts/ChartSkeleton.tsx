import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  /** Altura em pixels (default 280) */
  h?: number;
  className?: string;
}

/**
 * Placeholder leve para gráficos lazy-carregados (recharts entra em chunk separado).
 * Usa tokens semânticos do design system.
 */
export function ChartSkeleton({ h = 280, className }: Props) {
  return (
    <div
      className={`w-full rounded-lg border border-border/40 bg-muted/20 animate-pulse ${className ?? ''}`}
      style={{ height: h }}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="h-full w-full p-4 flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex-1 flex items-end gap-2">
          {[40, 70, 55, 90, 60, 80, 45, 75, 65, 85].map((v, i) => (
            <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${v}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
