import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MedicalDoctorPerf {
  id: string;
  name: string;
  total: number;
  completed: number;
  no_shows: number;
  revenue: number;
  completion_pct: number;
}

export interface MedicalProcedureMix {
  id: string;
  name: string;
  volume: number;
  revenue: number;
  avg_ticket: number;
}

export interface MedicalPaymentMix {
  method: string;
  count: number;
  revenue: number;
  avg_ticket: number;
  paid_count: number;
  pending_count: number;
}

export interface MedicalDoctorProcedureCell {
  doctor_id: string;
  doctor_name: string;
  procedure_id: string;
  procedure_name: string;
  executions: number;
  revenue: number;
  avg_ticket: number;
}

export interface MedicalCrossInsightsData {
  doctor_performance: MedicalDoctorPerf[];
  procedure_mix: MedicalProcedureMix[];
  payment_mix: MedicalPaymentMix[];
  doctor_procedure: MedicalDoctorProcedureCell[];
}

export interface MedicalCrossFilters {
  from: Date;
  to: Date;
  doctorId?: string | null;
  procedureId?: string | null;
}

const EMPTY: MedicalCrossInsightsData = {
  doctor_performance: [],
  procedure_mix: [],
  payment_mix: [],
  doctor_procedure: [],
};

export function useMedicalCrossInsights(
  practiceId: string | null,
  filters?: MedicalCrossFilters,
) {
  const query = useQuery<MedicalCrossInsightsData>({
    queryKey: [
      'medical-cross-insights',
      practiceId,
      filters?.from?.toISOString(),
      filters?.to?.toISOString(),
      filters?.doctorId ?? null,
      filters?.procedureId ?? null,
    ],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_medical_cross_insights', {
        p_practice_id: practiceId,
        p_from: filters!.from.toISOString(),
        p_to: filters!.to.toISOString(),
        p_doctor_id: filters?.doctorId ?? null,
        p_procedure_id: filters?.procedureId ?? null,
      });
      if (error) throw error;
      return (data ?? EMPTY) as MedicalCrossInsightsData;
    },
    enabled: !!practiceId && !!filters?.from && !!filters?.to,
    staleTime: 2 * 60 * 1000,
  });

  return {
    data: query.data ?? EMPTY,
    isLoading: query.isLoading,
    error: query.error,
  };
}
