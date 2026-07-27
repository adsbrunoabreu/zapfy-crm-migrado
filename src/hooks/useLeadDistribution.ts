import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface LeadDistributionSettings {
  id: string;
  company_id: string;
  enabled: boolean;
  distribution_mode: 'round_robin' | 'random';
  created_at: string;
  updated_at: string;
}

export interface LeadDistributionUser {
  id: string;
  company_id: string;
  user_id: string;
  is_active: boolean;
  assigned_count: number;
  max_chats: number | null;
  created_at: string;
  user?: {
    id: string;
    full_name: string | null;
    email: string;
  };
}

export function useLeadDistributionSettings() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['lead-distribution-settings', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return null;

      const { data, error } = await supabase
        .from('lead_distribution_settings')
        .select('*')
        .eq('company_id', profile.company_id)
        .maybeSingle();

      if (error) throw error;
      return data as LeadDistributionSettings | null;
    },
    enabled: !!profile?.company_id,
  });
}

export function useLeadDistributionUsers() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['lead-distribution-users', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];

      const { data, error } = await supabase
        .from('lead_distribution_users')
        .select(`
          *,
          user:profiles!user_id(id, full_name, email)
        `)
        .eq('company_id', profile.company_id);

      if (error) throw error;
      return (data || []) as LeadDistributionUser[];
    },
    enabled: !!profile?.company_id,
  });
}

export function useUpsertDistributionSettings() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (settings: { enabled: boolean; distribution_mode: 'round_robin' | 'random' }) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const { data, error } = await supabase
        .from('lead_distribution_settings')
        .upsert({
          company_id: profile.company_id,
          enabled: settings.enabled,
          distribution_mode: settings.distribution_mode,
        }, {
          onConflict: 'company_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-distribution-settings'] });
      toast.success('Configurações de distribuição salvas!');
    },
    onError: (error) => {
      toast.error('Erro ao salvar configurações: ' + error.message);
    },
  });
}

export function useToggleDistributionUser() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      // Check if user exists in distribution table
      const { data: existing } = await supabase
        .from('lead_distribution_users')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('lead_distribution_users')
          .update({ is_active: isActive })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('lead_distribution_users')
          .insert({
            company_id: profile.company_id,
            user_id: userId,
            is_active: isActive,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-distribution-users'] });
    },
    onError: (error) => {
      toast.error('Erro ao atualizar usuário: ' + error.message);
    },
  });
}

export function useDistributeLeadsNow() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const { data, error } = await supabase.functions.invoke('distribute-leads', {
        body: { company_id: profile.company_id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-leads'] });
      queryClient.invalidateQueries({ queryKey: ['chat-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['leads-with-phone'] });
      queryClient.invalidateQueries({ queryKey: ['lead-distribution-users'] });
      toast.success(`${data.distributed || 0} leads distribuídos com sucesso!`);
    },
    onError: (error) => {
      toast.error('Erro ao distribuir leads: ' + error.message);
    },
  });
}

export function useUnassignedLeadsCount() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['unassigned-leads-count', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return 0;

      const { count, error } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', profile.company_id)
        .is('assigned_to', null);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile?.company_id,
  });
}

export function useUpdateMaxChats() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, maxChats }: { userId: string; maxChats: number | null }) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');

      const { data: existing } = await supabase
        .from('lead_distribution_users')
        .select('id')
        .eq('company_id', profile.company_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('lead_distribution_users')
          .update({ max_chats: maxChats } as any)
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('lead_distribution_users')
          .insert({
            company_id: profile.company_id,
            user_id: userId,
            is_active: false,
            max_chats: maxChats,
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-distribution-users'] });
      toast.success('Limite de chats atualizado!');
    },
    onError: (error) => {
      toast.error('Erro ao atualizar limite: ' + error.message);
    },
  });
}
