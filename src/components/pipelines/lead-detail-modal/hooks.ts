import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useFullLeadData(leadId: string | null) {
  return useQuery({
    queryKey: ['lead-full', leadId],
    enabled: !!leadId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase
        .from('leads')
        .select('*, stage:pipeline_stages(id, name, color)')
        .eq('id', leadId)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useLossReasonLabel(reasonId?: string | null) {
  return useQuery({
    queryKey: ['loss-reason', reasonId],
    enabled: !!reasonId,
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      if (!reasonId) return null;
      const { data } = await supabase
        .from('loss_reasons').select('label').eq('id', reasonId).maybeSingle();
      return data?.label || null;
    },
  });
}
