import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MedicalKPIs } from '@/types/medical';

export type MedicalKPIsExtended = MedicalKPIs;

export interface MedicalKPIFilters {
  from: Date;
  to: Date;
  doctorId?: string | null;
  procedureId?: string | null;
}

export function useMedicalKPIs(practiceId: string | null, filters?: MedicalKPIFilters) {
  const { data, isLoading, error } = useQuery<MedicalKPIsExtended>({
    queryKey: [
      'medical-kpis',
      practiceId,
      filters?.from?.toISOString(),
      filters?.to?.toISOString(),
      filters?.doctorId ?? null,
      filters?.procedureId ?? null,
    ],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_medical_kpis', {
        p_practice_id: practiceId,
        p_from: filters!.from.toISOString(),
        p_to: filters!.to.toISOString(),
        p_doctor_id: filters?.doctorId ?? null,
        p_procedure_id: filters?.procedureId ?? null,
      });
      if (error) throw error;
      return data as MedicalKPIsExtended;
    },
    enabled: !!practiceId && !!filters?.from && !!filters?.to,
    staleTime: 2 * 60 * 1000,
  });

  return { kpis: data, isLoading, error };
}
