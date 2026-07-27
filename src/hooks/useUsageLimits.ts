import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface UsageLimits {
  users: number;
  leads: number;
  whatsapp_instances: number;
  pipelines: number;
}

export function useUsageLimits(companyId?: string) {
  return useQuery({
    queryKey: ['usage-limits', companyId],
    queryFn: async (): Promise<UsageLimits> => {
      if (!companyId) return { users: 0, leads: 0, whatsapp_instances: 0, pipelines: 0 };

      const [users, leads, instances, pipelines] = await Promise.all([
        supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('is_active', true),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId),
        (supabase as any)
          .from('whatsapp_instances')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId),
        supabase
          .from('pipelines')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId),
      ]);

      return {
        users: users.count || 0,
        leads: leads.count || 0,
        whatsapp_instances: instances.count || 0,
        pipelines: pipelines.count || 0,
      };
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}
