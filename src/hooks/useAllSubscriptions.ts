import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AdminSubscription {
  id: string;
  company_id: string;
  company_name: string;
  plan_id: string | null;
  plan_name: string;
  monthly_price: number;
  billing_cycle: 'monthly' | 'yearly';
  status: string;
  started_at: string;
  current_period_start: string;
  current_period_end: string;
  canceled_at: string | null;
}

export function useAllSubscriptions() {
  return useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: async (): Promise<AdminSubscription[]> => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      if (error) throw error;

      const companyIds = Array.from(new Set((data || []).map((s: any) => s.company_id).filter(Boolean)));
      let nameById = new Map<string, string>();
      if (companyIds.length) {
        const { data: companies, error: cErr } = await supabase
          .from('companies')
          .select('id, name')
          .in('id', companyIds);
        if (cErr) throw cErr;
        nameById = new Map((companies || []).map((c: any) => [c.id, c.name]));
      }

      return (data || []).map((s: any) => ({
        ...s,
        company_name: nameById.get(s.company_id) || '—',
      }));
    },
  });
}

export function useCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancel_subscription', { _subscription_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

export function useRenewSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('renew_subscription', { _subscription_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

export function useDeleteSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subscriptions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] }),
  });
}
