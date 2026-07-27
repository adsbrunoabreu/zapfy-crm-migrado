import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { UserGoal } from './useUserGoals';

export interface GoalProgress {
  goalId: string;
  currentValue: number;
  targetValue: number;
  percentage: number;
}

export function useGoalProgress(goals: UserGoal[]) {
  const { profile } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['goal-progress', companyId, goals.map((g) => g.id).join(',')],
    queryFn: async (): Promise<Record<string, GoalProgress>> => {
      if (!companyId || goals.length === 0) return {};

      const results: Record<string, GoalProgress> = {};

      await Promise.all(
        goals.map(async (goal) => {
          const { data, error } = await supabase.rpc('get_goal_progress', {
            p_metric: goal.goal_type,
            p_user_ids: [goal.user_id] as any,
            p_pipeline_id: null,
            p_period_start: goal.period_start,
            p_period_end: goal.period_end,
          });

          const currentValue = error || data == null ? 0 : Number(data);
          const percentage =
            goal.target_value > 0 ? Math.min(Math.round((currentValue / goal.target_value) * 100), 150) : 0;

          results[goal.id] = {
            goalId: goal.id,
            currentValue,
            targetValue: goal.target_value,
            percentage,
          };
        }),
      );

      return results;
    },
    enabled: !!companyId && goals.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}
