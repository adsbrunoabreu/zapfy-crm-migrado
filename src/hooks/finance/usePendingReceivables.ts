import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PendingReceivables {
  pending_count: number;
  pending_value: number;
}

/**
 * Retorna quantidade e valor total de contas a receber ainda NÃO pagas
 * (todas as fichas ganhas que ainda precisam de confirmação de pagamento).
 * Usado pelo badge da sidebar (Financeiro) e pelo alerta no topo do painel.
 */
export function usePendingReceivables() {
  const { profile } = useAuth();
  return useQuery<PendingReceivables>({
    queryKey: ['finance-pending-receivables', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_finance_pending_receivables');
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return {
        pending_count: Number(row?.pending_count ?? 0),
        pending_value: Number(row?.pending_value ?? 0),
      };
    },
    enabled: !!profile?.company_id,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
  });
}
