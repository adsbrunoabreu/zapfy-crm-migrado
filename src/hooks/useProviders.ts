/**
 * useProviders — lê as instâncias de WhatsApp da empresa atual e
 * identifica a "principal" (active). Usado pelo Chat para exibir o
 * status do provider ativo e abrir o seletor de novos providers.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ProviderType } from '@/types/providers';

export interface ProviderInstance {
  id: string;
  provider: ProviderType;
  instance_name: string;
  display_name: string | null;
  phone_number: string | null;
  status: string | null;
  is_active: boolean;
  is_preferred: boolean;
}

export function useProviders() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const query = useQuery({
    queryKey: ['providers', companyId],
    enabled: !!companyId,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<ProviderInstance[]> => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, provider, instance_name, display_name, phone_number, status, is_active, is_preferred')
        .eq('company_id', companyId!)
        .order('is_preferred', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ProviderInstance[];
    },
  });

  const providers = query.data ?? [];
  const activeProvider =
    providers.find((p) => p.is_preferred && p.is_active) ??
    providers.find((p) => p.is_active) ??
    null;

  return {
    providers,
    activeProvider,
    isLoading: query.isLoading,
    refetch: query.refetch,
    companyId,
  };
}
