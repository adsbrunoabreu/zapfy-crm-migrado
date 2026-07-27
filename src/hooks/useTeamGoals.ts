import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type GoalMetric =
  | 'leads'
  | 'value'
  | 'conversions'
  | 'ticket_avg'
  | 'conversion_rate'
  | 'response_time'
  | 'messages_sent';

export type GoalScope = 'company' | 'group' | 'pipeline';

export interface TeamGoal {
  id: string;
  company_id: string;
  name: string;
  scope: GoalScope;
  group_id: string | null;
  pipeline_id: string | null;
  metric: GoalMetric;
  target_value: number;
  period_start: string;
  period_end: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
  group?: { id: string; name: string; color: string } | null;
  pipeline?: { id: string; name: string } | null;
}

export interface UpsertTeamGoalInput {
  id?: string;
  name: string;
  scope: GoalScope;
  group_id?: string | null;
  pipeline_id?: string | null;
  metric: GoalMetric;
  target_value: number;
  period_start: string;
  period_end: string;
  status?: 'active' | 'archived';
}

export function useTeamGoals() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['team-goals', profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_goals')
        .select('*, group:team_goal_groups(id,name,color), pipeline:pipelines(id,name)')
        .order('period_end', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as TeamGoal[];
    },
  });
}

export function useUpsertTeamGoal() {
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  return useMutation({
    mutationFn: async (input: UpsertTeamGoalInput) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');
      const payload = {
        name: input.name,
        scope: input.scope,
        group_id: input.scope === 'group' ? input.group_id ?? null : null,
        pipeline_id: input.scope === 'pipeline' ? input.pipeline_id ?? null : null,
        metric: input.metric,
        target_value: input.target_value,
        period_start: input.period_start,
        period_end: input.period_end,
        status: input.status ?? 'active',
      };
      if (input.id) {
        const { error } = await supabase.from('team_goals').update(payload).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('team_goals')
          .insert({ ...payload, company_id: profile.company_id, created_by: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-goals'] });
      qc.invalidateQueries({ queryKey: ['team-goal-progress'] });
      toast.success('Meta de equipe salva');
    },
    onError: (e: Error) => toast.error('Erro ao salvar meta: ' + e.message),
  });
}

export function useDeleteTeamGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('team_goals').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-goals'] });
      toast.success('Meta removida');
    },
    onError: (e: Error) => toast.error('Erro ao remover: ' + e.message),
  });
}

/**
 * Progresso de uma meta de equipe usando RPC unificada.
 * Resolve user_ids do grupo (se houver) e invoca get_goal_progress.
 */
export function useTeamGoalProgress(goals: TeamGoal[]) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['team-goal-progress', profile?.company_id, goals.map((g) => g.id).join(',')],
    enabled: !!profile?.company_id && goals.length > 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<Record<string, { currentValue: number; percentage: number }>> => {
      const result: Record<string, { currentValue: number; percentage: number }> = {};

      // Coleta member_ids dos grupos usados
      const groupIds = Array.from(new Set(goals.filter((g) => g.scope === 'group' && g.group_id).map((g) => g.group_id!)));
      let membersByGroup: Record<string, string[]> = {};
      if (groupIds.length) {
        const { data } = await supabase
          .from('team_goal_group_members')
          .select('group_id,user_id')
          .in('group_id', groupIds);
        (data ?? []).forEach((m: any) => {
          membersByGroup[m.group_id] = membersByGroup[m.group_id] || [];
          membersByGroup[m.group_id].push(m.user_id);
        });
      }

      await Promise.all(
        goals.map(async (goal) => {
          const userIds = goal.scope === 'group' && goal.group_id ? membersByGroup[goal.group_id] ?? [] : null;
          const pipelineId = goal.scope === 'pipeline' ? goal.pipeline_id : null;

          const { data, error } = await supabase.rpc('get_goal_progress', {
            p_metric: goal.metric,
            p_user_ids: userIds as any,
            p_pipeline_id: pipelineId,
            p_period_start: goal.period_start,
            p_period_end: goal.period_end,
          });
          const current = error || data == null ? 0 : Number(data);
          const pct = goal.target_value > 0 ? Math.min(Math.round((current / goal.target_value) * 100), 150) : 0;
          result[goal.id] = { currentValue: current, percentage: pct };
        }),
      );

      return result;
    },
  });
}
