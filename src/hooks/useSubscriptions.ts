import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Subscription {
  id: string;
  company_id: string;
  plan_id?: string | null;
  plan_name: string;
  monthly_price: number;
  billing_cycle: 'monthly' | 'yearly';
  status: 'active' | 'trialing' | 'canceled' | 'past_due';
  started_at: string;
  current_period_start: string;
  current_period_end: string;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Subscription[];
    },
  });
}

export function useCompanySubscription(companyId?: string) {
  return useQuery({
    queryKey: ['subscription', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await (supabase as any)
        .from('subscriptions')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Subscription | null;
    },
    enabled: !!companyId,
  });
}

export function useUpsertSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sub: Partial<Subscription> & { company_id: string }) => {
      if (sub.id) {
        const { id, ...updates } = sub;
        const { error } = await (supabase as any)
          .from('subscriptions')
          .update(updates)
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('subscriptions')
          .insert(sub);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['subscriptions'] });
      qc.invalidateQueries({ queryKey: ['subscription', vars.company_id] });
      qc.invalidateQueries({ queryKey: ['admin', 'subscriptions'] });
      qc.invalidateQueries({ queryKey: ['master-dashboard-stats'] });
    },
  });
}
