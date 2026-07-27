import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MedicalDailyPoint {
  date: string;
  revenue: number;
  total: number;
  completed: number;
  no_show: number;
  cancelled: number;
}

export interface MedicalTopProcedure {
  id: string;
  name: string;
  count: number;
  revenue: number;
}

export interface MedicalDoctorPerformance {
  id: string;
  name: string;
  appointments: number;
  no_shows: number;
  revenue: number;
}

export interface MedicalDashboardSeries {
  daily: MedicalDailyPoint[];
  top_procedures: MedicalTopProcedure[];
  doctor_performance: MedicalDoctorPerformance[];
}

export interface MedicalSeriesFilters {
  from: Date;
  to: Date;
  doctorId?: string | null;
  procedureId?: string | null;
}

export function useMedicalDashboardSeries(
  practiceId: string | null,
  filters?: MedicalSeriesFilters,
) {
  const query = useQuery<MedicalDashboardSeries>({
    queryKey: [
      'medical-dashboard-series',
      practiceId,
      filters?.from?.toISOString(),
      filters?.to?.toISOString(),
      filters?.doctorId ?? null,
      filters?.procedureId ?? null,
    ],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_medical_dashboard_series', {
        p_practice_id: practiceId,
        p_from: filters!.from.toISOString(),
        p_to: filters!.to.toISOString(),
        p_doctor_id: filters?.doctorId ?? null,
        p_procedure_id: filters?.procedureId ?? null,
      });
      if (error) throw error;
      return (data ?? { daily: [], top_procedures: [], doctor_performance: [] }) as MedicalDashboardSeries;
    },
    enabled: !!practiceId && !!filters?.from && !!filters?.to,
    staleTime: 2 * 60 * 1000,
  });

  return {
    series: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
