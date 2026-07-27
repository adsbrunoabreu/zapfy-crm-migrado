import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface Props {
  label: string;
  value: string;
  previous?: number;
  current?: number;
  tone?: 'default' | 'success' | 'danger' | 'info' | 'warning';
  icon?: React.ReactNode;
  hint?: string;
  tooltip?: string;
}

const toneText: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-foreground',
  success: 'text-emerald',
  danger: 'text-rose',
  info: 'text-cyan',
  warning: 'text-amber',
};

export function KpiDeltaCard({ label, value, previous, current, tone = 'default', icon, hint, tooltip }: Props) {
  const hasDelta = previous !== undefined && current !== undefined;
  let pct: number | null = null;
  if (hasDelta) {
    if (previous === 0) pct = current === 0 ? 0 : null;
    else pct = ((current! - previous!) / Math.abs(previous!)) * 100;
  }

  const positive = pct !== null && pct > 0;
  const negative = pct !== null && pct < 0;
  const deltaCls = positive ? 'text-emerald' : negative ? 'text-rose' : 'text-muted-foreground';
  const Arrow = positive ? TrendingUp : negative ? TrendingDown : Minus;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-muted-foreground truncate">{label}</span>
          {tooltip && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground/70 hover:text-foreground transition-colors shrink-0"
                    aria-label="Mais informações"
                  >
                    <Info className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-xs leading-relaxed">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
        {icon && <span className={toneText[tone]}>{icon}</span>}
      </div>
      <div className={cn('text-2xl font-semibold tabular-nums', toneText[tone])}>{value}</div>
      <div className="flex items-center gap-1.5 mt-2 text-xs">
        {pct === null ? (
          <span className="text-muted-foreground">sem comparativo</span>
        ) : (
          <>
            <Arrow className={cn('w-3 h-3', deltaCls)} />
            <span className={cn('font-medium tabular-nums', deltaCls)}>
              {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">vs período anterior</span>
          </>
        )}
        {hint && <span className="text-muted-foreground ml-auto">{hint}</span>}
      </div>
    </Card>
  );
}
