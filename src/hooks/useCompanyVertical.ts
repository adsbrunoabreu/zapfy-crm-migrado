import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Retorna a vertical da empresa do usuário logado.
 * - Master sem company_id: retorna 'standard' (mas ele sempre vê o menu médico).
 * - Demais: lê de companies.crm_vertical.
 */
export function useCompanyVertical() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: ['company-vertical', companyId],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<'standard' | 'medical'> => {
      const { data, error } = await (supabase as any)
        .from('companies')
        .select('crm_vertical')
        .eq('id', companyId)
        .maybeSingle();
      if (error) throw error;
      return (data?.crm_vertical as 'standard' | 'medical') ?? 'standard';
    },
  });
}
