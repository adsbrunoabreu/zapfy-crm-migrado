import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGoalSuggestion } from '@/hooks/useGoalSuggestion';
import { formatMetricValue, METRIC_CONFIG } from '@/lib/goals/metrics';
import type { GoalMetric, GoalScope } from '@/hooks/useTeamGoals';
import { cn } from '@/lib/utils';

interface Props {
  metric: GoalMetric;
  scope: GoalScope;
  userIds?: string[] | null;
  pipelineId?: string | null;
  periodDays: number;
  onPick: (value: number) => void;
}

export function SmartTargetSuggestion({ metric, scope, userIds, pipelineId, periodDays, onPick }: Props) {
  const { data, isLoading } = useGoalSuggestion({
    metric,
    scope,
    userIds,
    pipelineId,
    periodDays,
    enabled: periodDays > 0,
  });

  const cfg = METRIC_CONFIG[metric];
  const validBaseline = data && data.baseline > 0;

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Sparkles className="w-3.5 h-3.5 text-primary" />
        <span className="font-medium">Sugestão inteligente</span>
        {isLoading && <Loader2 className="w-3 h-3 animate-spin" />}
      </div>

      {!isLoading && !validBaseline && (
        <p className="text-[11px] text-muted-foreground">
          Sem histórico suficiente para sugerir. Defina o alvo manualmente abaixo.
        </p>
      )}

      {validBaseline && data && (
        <>
          <p className="text-[11px] text-muted-foreground">
            Média dos últimos 3 períodos: <span className="text-foreground font-medium">{formatMetricValue(data.baseline, metric)}</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Conservadora', value: data.conservative, hint: '-10%', tone: 'border-muted-foreground/30' },
              { label: 'Realista', value: data.realistic, hint: 'média', tone: 'border-primary/50 bg-primary/5' },
              { label: 'Agressiva', value: data.aggressive, hint: '+30%', tone: 'border-amber/40' },
            ].map((opt) => (
              <Button
                key={opt.label}
                type="button"
                variant="outline"
                onClick={() => onPick(Math.round(opt.value * 100) / 100)}
                className={cn('h-auto flex-col items-start gap-0.5 py-2 px-2.5', opt.tone)}
              >
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {opt.label} <span className="opacity-60">{opt.hint}</span>
                </span>
                <span className="text-sm font-semibold tabular-nums">{formatMetricValue(opt.value, metric)}</span>
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
