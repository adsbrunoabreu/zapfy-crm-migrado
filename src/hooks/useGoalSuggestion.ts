import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { GoalMetric, GoalScope } from './useTeamGoals';

export interface GoalSuggestion {
  baseline: number;
  conservative: number;
  realistic: number;
  aggressive: number;
}

interface Params {
  metric: GoalMetric;
  scope: GoalScope;
  userIds?: string[] | null;
  pipelineId?: string | null;
  periodDays: number;
  enabled?: boolean;
}

export function useGoalSuggestion({ metric, scope, userIds, pipelineId, periodDays, enabled = true }: Params) {
  return useQuery({
    queryKey: ['goal-suggestion', metric, scope, userIds?.sort().join(','), pipelineId, periodDays],
    enabled: enabled && periodDays > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<GoalSuggestion> => {
      const { data, error } = await supabase.rpc('suggest_goal_target', {
        p_metric: metric,
        p_user_ids: (scope === 'company' ? null : userIds ?? null) as any,
        p_pipeline_id: scope === 'pipeline' ? pipelineId ?? null : null,
        p_period_days: periodDays,
      });
      if (error) throw error;
      const d: any = data ?? {};
      return {
        baseline: Number(d.baseline ?? 0),
        conservative: Number(d.conservative ?? 0),
        realistic: Number(d.realistic ?? 0),
        aggressive: Number(d.aggressive ?? 0),
      };
    },
  });
}
