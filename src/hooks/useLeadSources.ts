import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface LeadSource {
  id: string;
  company_id: string;
  label: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function useLeadSources(opts?: { onlyActive?: boolean }) {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const onlyActive = opts?.onlyActive ?? false;

  const query = useQuery({
    queryKey: ['lead-sources', profile?.company_id, onlyActive],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      let q = supabase
        .from('lead_sources' as any)
        .select('*')
        .eq('company_id', profile.company_id)
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true })
        .limit(200);
      if (onlyActive) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as LeadSource[];
    },
    enabled: !!profile?.company_id,
    staleTime: 1000 * 60 * 5,
  });

  // Auto-seed se a empresa ainda não tem nenhuma origem (cobre empresas antigas)
  useEffect(() => {
    if (!profile?.company_id) return;
    if (query.isLoading || query.isFetching) return;
    if ((query.data?.length ?? 0) > 0) return;
    (async () => {
      const { error } = await supabase.rpc('seed_default_lead_sources' as any, {
        _company_id: profile.company_id,
      } as any);
      if (!error) qc.invalidateQueries({ queryKey: ['lead-sources'] });
    })();
  }, [profile?.company_id, query.isLoading, query.isFetching, query.data?.length, qc]);

  return query;
}

export function useCreateLeadSource() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (input: { label: string; sort_order?: number }) => {
      if (!profile?.company_id) throw new Error('Empresa não encontrada');
      const { error } = await supabase.from('lead_sources' as any).insert({
        company_id: profile.company_id,
        label: input.label.trim(),
        sort_order: input.sort_order ?? 0,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-sources'] }),
  });
}

export function useUpdateLeadSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; label?: string; is_active?: boolean; sort_order?: number }) => {
      const { id, ...patch } = input;
      const { error } = await supabase.from('lead_sources' as any).update(patch as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-sources'] }),
  });
}

export function useDeleteLeadSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('lead_sources' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-sources'] }),
  });
}
