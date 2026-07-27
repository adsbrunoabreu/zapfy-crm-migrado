import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MedicalInsight } from '@/types/medical';

export function useMedicalInsights(practiceId: string | null) {
  return useQuery<MedicalInsight[]>({
    queryKey: ['medical-insights', practiceId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('medical_ai_insights')
        .select('*')
        .eq('practice_id', practiceId)
        .eq('dismissed', false)
        .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())
        .order('severity', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as MedicalInsight[];
    },
    enabled: !!practiceId,
    staleTime: 2 * 60 * 1000,
  });
}

type ActionVariant = 'dismiss' | 'action_taken';

export function useUpdateMedicalInsight(practiceId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, variant }: { id: string; variant: ActionVariant }) => {
      const patch = variant === 'dismiss'
        ? { dismissed: true, dismissed_at: new Date().toISOString() }
        : { action_taken: true, action_taken_at: new Date().toISOString() };

      const { error } = await (supabase as any)
        .from('medical_ai_insights')
        .update(patch)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['medical-insights', practiceId] });
    },
  });
}
