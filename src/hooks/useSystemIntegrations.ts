import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface IntegrationConfig {
  key: string;
  value: Record<string, any>;
  updated_at: string;
}

export const useSystemIntegrations = () => {
  return useQuery({
    queryKey: ['system_integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_integrations')
        .select('*');
      if (error) throw error;
      const map: Record<string, IntegrationConfig> = {};
      (data || []).forEach((row: any) => { map[row.key] = row; });
      return map;
    },
    staleTime: 60_000,
  });
};

export const useUpsertIntegration = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: Record<string, any> }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('system_integrations')
        .upsert({ key, value, updated_by: user?.id }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['system_integrations'] }),
  });
};
