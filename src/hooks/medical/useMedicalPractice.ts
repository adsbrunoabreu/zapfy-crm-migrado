import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MedicalPractice } from '@/types/medical';

/** Practice da empresa logada (1 por company). */
export function useMyMedicalPractice(companyId: string | null | undefined) {
  return useQuery<MedicalPractice | null>({
    queryKey: ['medical-practice', companyId],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('medical_practices')
        .select('*')
        .eq('company_id', companyId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as MedicalPractice | null;
    },
  });
}

/** Lista todas as practices (apenas master, via RLS). */
export function useAllMedicalPractices(enabled: boolean) {
  return useQuery<MedicalPractice[]>({
    queryKey: ['medical-practices-all'],
    enabled,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('medical_practices')
        .select('*')
        .order('practice_name')
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MedicalPractice[];
    },
  });
}
