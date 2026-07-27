import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface TrialInfo {
  plan_status: 'active' | 'trial' | 'suspended' | 'cancelled';
  trial_ends_at: string | null;
  days_left: number;
  hours_left: number;
  expired: boolean;
}

export function useTrialStatus() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['trial-status', profile?.company_id],
    enabled: !!profile?.company_id,
    // Servidor calcula hours_left/expired com now() do banco — manter fresco
    // para o TrialBanner reagir sem depender do relógio do navegador.
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<TrialInfo | null> => {
      const { data, error } = await (supabase as any)
        .rpc('get_company_trial_info', { _company_id: profile!.company_id });
      if (error) throw error;
      return (data && data[0]) || null;
    },
  });
}
