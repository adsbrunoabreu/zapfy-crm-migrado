import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CompanyAddons {
  ai_agent: boolean;
  automations: boolean;
  ecommerce: boolean;
}

export function useCompanyAddons() {
  const { profile, isMaster } = useAuth();
  const companyId = profile?.company_id;

  const query = useQuery({
    queryKey: ['company-addons', companyId],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<CompanyAddons> => {
      const { data } = await supabase
        .from('companies')
        .select('ai_agent_enabled, automations_enabled, ecommerce_enabled')
        .eq('id', companyId!)
        .maybeSingle();
      return {
        ai_agent: !!data?.ai_agent_enabled,
        automations: !!data?.automations_enabled,
        ecommerce: !!(data as { ecommerce_enabled?: boolean } | null)?.ecommerce_enabled,
      };
    },
  });

  return {
    addons: query.data ?? { ai_agent: false, automations: false, ecommerce: false },
    isLoading: query.isLoading,
    isMaster,
  };
}
