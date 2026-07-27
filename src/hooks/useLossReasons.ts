import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface LossReason {
  id: string;
  company_id: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useLossReasons(opts?: { onlyActive?: boolean }) {
  const { profile } = useAuth();
  const onlyActive = opts?.onlyActive ?? false;
  return useQuery({
    queryKey: ['loss-reasons', profile?.company_id, onlyActive],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      let q = supabase
        .from('loss_reasons')
        .select('*')
        .eq('company_id', profile.company_id)
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true })
        .limit(200);
      if (onlyActive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as LossReason[];
    },
    enabled: !!profile?.company_id,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateLossReason() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: { label: string; sort_order?: number }) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');
      const { error } = await supabase.from('loss_reasons').insert({
        company_id: profile.company_id,
        label: input.label.trim(),
        sort_order: input.sort_order ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loss-reasons'] }),
  });
}

export function useUpdateLossReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; label?: string; is_active?: boolean; sort_order?: number }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from('loss_reasons').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loss-reasons'] }),
  });
}

export function useDeleteLossReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('loss_reasons').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loss-reasons'] }),
  });
}
