import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PieSlice { name: string; count: number }
export interface MedicalPieBreakdowns {
  procedures: PieSlice[];
  doctors: PieSlice[];
  insurances: PieSlice[];
  hospitals: PieSlice[];
}

interface Filters {
  from?: Date;
  to?: Date;
  doctorId?: string | null;
  procedureId?: string | null;
}

export function useMedicalPieBreakdowns(practiceId: string | null, filters: Filters) {
  return useQuery({
    queryKey: ['medical-pie-breakdowns', practiceId, filters.from?.toISOString(), filters.to?.toISOString(), filters.doctorId, filters.procedureId],
    enabled: !!practiceId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<MedicalPieBreakdowns> => {
      const { data, error } = await supabase.rpc('get_medical_pie_breakdowns', {
        p_practice_id: practiceId!,
        p_from: filters.from?.toISOString() ?? null,
        p_to: filters.to?.toISOString() ?? null,
        p_doctor_id: filters.doctorId ?? null,
        p_procedure_id: filters.procedureId ?? null,
      });
      if (error) throw error;
      const d = (data ?? {}) as Partial<MedicalPieBreakdowns>;
      return {
        procedures: d.procedures ?? [],
        doctors: d.doctors ?? [],
        insurances: d.insurances ?? [],
        hospitals: d.hospitals ?? [],
      };
    },
  });
}
