import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface GoalGroup {
  id: string;
  company_id: string;
  name: string;
  color: string;
  created_at: string;
  members?: { user_id: string }[];
}

export function useGoalGroups() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['goal-groups', profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_goal_groups')
        .select('*, members:team_goal_group_members(user_id)')
        .order('name')
        .limit(100);
      if (error) throw error;
      return (data ?? []) as GoalGroup[];
    },
  });
}

export function useUpsertGoalGroup() {
  const qc = useQueryClient();
  const { profile, user } = useAuth();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; color: string; member_ids: string[] }) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');
      let groupId = input.id;
      if (groupId) {
        const { error } = await supabase
          .from('team_goal_groups')
          .update({ name: input.name, color: input.color })
          .eq('id', groupId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('team_goal_groups')
          .insert({ company_id: profile.company_id, name: input.name, color: input.color, created_by: user?.id })
          .select('id')
          .single();
        if (error) throw error;
        groupId = data.id;
      }
      // Substitui membros
      await supabase.from('team_goal_group_members').delete().eq('group_id', groupId);
      if (input.member_ids.length > 0) {
        const rows = input.member_ids.map((uid) => ({ group_id: groupId!, user_id: uid }));
        const { error } = await supabase.from('team_goal_group_members').insert(rows);
        if (error) throw error;
      }
      return groupId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goal-groups'] });
      toast.success('Grupo salvo');
    },
    onError: (e: Error) => toast.error('Erro ao salvar grupo: ' + e.message),
  });
}

export function useDeleteGoalGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('team_goal_groups').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goal-groups'] });
      qc.invalidateQueries({ queryKey: ['team-goals'] });
      toast.success('Grupo removido');
    },
    onError: (e: Error) => toast.error('Erro ao remover: ' + e.message),
  });
}
