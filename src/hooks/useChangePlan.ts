import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useChangePlan(companyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ planId, billingCycle }: { planId: string; billingCycle?: 'monthly' | 'yearly' }) => {
      const { data, error } = await (supabase as any).rpc('change_subscription_plan', {
        _new_plan_id: planId,
        _billing_cycle: billingCycle ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Plano atualizado');
      qc.invalidateQueries({ queryKey: ['subscription', companyId] });
      qc.invalidateQueries({ queryKey: ['invoices', companyId] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao alterar plano'),
  });
}

export function useCancelSubscription(companyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('cancel_my_subscription');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Assinatura será cancelada ao fim do período');
      qc.invalidateQueries({ queryKey: ['subscription', companyId] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao cancelar'),
  });
}

export function useReactivateSubscription(companyId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc('reactivate_my_subscription');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Assinatura reativada');
      qc.invalidateQueries({ queryKey: ['subscription', companyId] });
    },
    onError: (e: any) => toast.error(e.message || 'Erro ao reativar'),
  });
}
