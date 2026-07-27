import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type GoalType =
  | 'leads'
  | 'value'
  | 'conversions'
  | 'ticket_avg'
  | 'conversion_rate'
  | 'response_time'
  | 'messages_sent';

export interface UserGoal {
  id: string;
  company_id: string;
  user_id: string;
  goal_type: GoalType;
  target_value: number;
  period_start: string;
  period_end: string;
  created_at: string;
  created_by: string | null;
  user?: { full_name: string | null; email: string };
}

export interface CreateGoalData {
  user_id: string;
  goal_type: GoalType;
  target_value: number;
  period_start: string;
  period_end: string;
}

export function useUserGoals() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['user-goals', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_goals')
        .select(`
          *,
          user:profiles!user_id(full_name, email)
        `)
        .order('period_start', { ascending: false });

      if (error) throw error;
      return (data ?? []) as UserGoal[];
    },
    enabled: !!profile?.company_id,
  });
}

export function useMyGoals() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-goals', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not found');

      const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('period_start', { ascending: false });

      if (error) throw error;
      return data as UserGoal[];
    },
    enabled: !!user?.id,
  });
}

export function useCreateGoal() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async (data: CreateGoalData) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const { data: result, error } = await supabase
        .from('user_goals')
        .insert({
          company_id: profile.company_id,
          user_id: data.user_id,
          goal_type: data.goal_type,
          target_value: data.target_value,
          period_start: data.period_start,
          period_end: data.period_end,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      toast.success('Meta criada com sucesso!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar meta: ' + error.message);
    },
  });
}

export function useUpdateGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<CreateGoalData> & { id: string }) => {
      const { data: result, error } = await supabase
        .from('user_goals')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      toast.success('Meta atualizada!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao atualizar meta: ' + error.message);
    },
  });
}

export function useDeleteGoal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_goals')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-goals'] });
      queryClient.invalidateQueries({ queryKey: ['my-goals'] });
      toast.success('Meta removida!');
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover meta: ' + error.message);
    },
  });
}
