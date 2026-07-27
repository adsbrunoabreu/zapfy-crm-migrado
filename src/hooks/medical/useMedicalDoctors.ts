import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MedicalDoctorOption {
  id: string;
  full_name: string;
}

/** Médicos ativos da clínica, para uso em filtros. */
export function useMedicalDoctors(practiceId: string | null | undefined) {
  return useQuery<MedicalDoctorOption[]>({
    queryKey: ['medical-doctors', practiceId],
    enabled: !!practiceId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('medical_doctors')
        .select('id, full_name')
        .eq('practice_id', practiceId)
        .eq('active', true)
        .order('full_name')
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as MedicalDoctorOption[]).sort((a, b) =>
        a.full_name.localeCompare(b.full_name, 'pt-BR', { sensitivity: 'base' }),
      );
    },
  });
}
