import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { STATUS_FILTERS } from './constants';
import type { StatusFilter } from './types';

interface Props {
  statusFilter: StatusFilter;
  setStatusFilter: (s: StatusFilter) => void;
  statusCounts: Record<StatusFilter, number>;
}

export const StatusFilterBar = memo(function StatusFilterBar({
  statusFilter, setStatusFilter, statusCounts,
}: Props) {
  return (
    <div className="flex items-stretch gap-0.5 xl:gap-1 px-1.5 xl:px-2 py-1.5 border-b border-border/50 bg-card/30 shrink-0">
      {STATUS_FILTERS.map((opt) => {
        const active = statusFilter === opt.value;
        const Icon = opt.icon;
        const count = statusCounts[opt.value];
        return (
          <Tooltip key={opt.value} delayDuration={150}>
            <TooltipTrigger asChild>
              <button
                onClick={() => setStatusFilter(opt.value)}
                aria-label={opt.label}
                className={cn(
                  'flex-1 min-w-0 inline-flex items-center justify-center gap-1 xl:gap-1.5 h-8 xl:h-9 rounded-md text-[11px] xl:text-xs font-medium transition-colors border px-1 xl:px-2',
                  active
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'border-border/40 hover:bg-accent/60 hover:border-border'
                )}
              >
                <Icon className={cn('w-3.5 h-3.5 xl:w-4 xl:h-4 shrink-0', !active && opt.color)} />
                {count > 0 && (
                  <span className={cn(
                    'tabular-nums text-[8px] xl:text-[9px] leading-none font-semibold inline-flex items-center justify-center h-4 xl:h-[18px] min-w-[16px] xl:min-w-[18px] px-1 xl:px-1.5 rounded-full border',
                    active
                      ? 'bg-primary/25 border-primary/40 text-primary'
                      : 'bg-muted border-border/60 text-muted-foreground'
                  )}>
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{opt.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
});
