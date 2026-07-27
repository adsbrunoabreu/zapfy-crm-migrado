import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { RankingMetric, RankingRow } from './useRankings';
import { metricValue } from './useRankings';

export type MissionMetric = RankingMetric;
export type MissionStatus = 'active' | 'archived';

export interface TeamMission {
  id: string;
  company_id: string;
  title: string;
  description: string | null;
  metric: MissionMetric;
  target_value: number;
  period_start: string;
  period_end: string;
  assigned_to: string | null;
  reward_label: string | null;
  reward_icon: string | null;
  status: MissionStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertMissionInput {
  id?: string;
  title: string;
  description?: string | null;
  metric: MissionMetric;
  target_value: number;
  period_start: string;
  period_end: string;
  assigned_to?: string | null;
  reward_label?: string | null;
  reward_icon?: string | null;
  status?: MissionStatus;
}

export function useTeamMissions() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['team-missions', profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_missions')
        .select('*')
        .order('period_end', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as TeamMission[];
    },
  });
}

export function useUpsertTeamMission() {
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  return useMutation({
    mutationFn: async (input: UpsertMissionInput) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');
      if (input.id) {
        const { error } = await supabase
          .from('team_missions')
          .update({
            title: input.title,
            description: input.description ?? null,
            metric: input.metric,
            target_value: input.target_value,
            period_start: input.period_start,
            period_end: input.period_end,
            assigned_to: input.assigned_to ?? null,
            reward_label: input.reward_label ?? null,
            reward_icon: input.reward_icon ?? 'trophy',
            status: input.status ?? 'active',
          })
          .eq('id', input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from('team_missions')
        .insert({
          company_id: profile.company_id,
          title: input.title,
          description: input.description ?? null,
          metric: input.metric,
          target_value: input.target_value,
          period_start: input.period_start,
          period_end: input.period_end,
          assigned_to: input.assigned_to ?? null,
          reward_label: input.reward_label ?? null,
          reward_icon: input.reward_icon ?? 'trophy',
          status: input.status ?? 'active',
          created_by: user?.id ?? null,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data!.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-missions'] });
      toast.success('Missão salva');
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar missão'),
  });
}

export function useDeleteTeamMission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('team_missions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team-missions'] });
      toast.success('Missão removida');
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao remover'),
  });
}

/**
 * Calcula o progresso de uma missão somando o valor da métrica entre os
 * usuários atribuídos (ou toda equipe quando assigned_to é null).
 * Reaproveita a fonte do ranking — não cria fetch novo.
 */
export function missionProgress(mission: TeamMission, rankings: RankingRow[]) {
  const scope = mission.assigned_to
    ? rankings.filter((r) => r.user_id === mission.assigned_to)
    : rankings;
  const current = scope.reduce((sum, r) => sum + metricValue(r, mission.metric), 0);
  const target = Number(mission.target_value) || 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : current > 0 ? 100 : 0;
  return { current, target, pct };
}
