import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string | null;
  monthly_price: number;
  yearly_price: number;
  max_users: number | null;
  max_leads: number | null;
  max_whatsapp_instances: number | null;
  max_pipelines: number | null;
  features: string[];
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function useSubscriptionPlans() {
  return useQuery({
    queryKey: ['subscription_plans'],
    queryFn: async (): Promise<SubscriptionPlan[]> => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('display_order', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        features: Array.isArray(p.features) ? p.features : [],
      }));
    },
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SubscriptionPlan>) => {
      const { error } = await supabase.from('subscription_plans').insert({
        name: input.name!,
        description: input.description ?? null,
        monthly_price: input.monthly_price ?? 0,
        yearly_price: input.yearly_price ?? 0,
        max_users: input.max_users ?? null,
        max_leads: input.max_leads ?? null,
        max_whatsapp_instances: input.max_whatsapp_instances ?? null,
        max_pipelines: input.max_pipelines ?? null,
        features: (input.features ?? []) as any,
        is_active: input.is_active ?? true,
        is_featured: input.is_featured ?? false,
        display_order: input.display_order ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription_plans'] }),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<SubscriptionPlan> & { id: string }) => {
      const { error } = await supabase
        .from('subscription_plans')
        .update(patch as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription_plans'] }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('subscription_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription_plans'] }),
  });
}

export function useTogglePlanActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    // Optimistic update for instant UI feedback
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey: ['subscription_plans'] });
      const prev = qc.getQueryData<SubscriptionPlan[]>(['subscription_plans']);
      qc.setQueryData<SubscriptionPlan[]>(['subscription_plans'], (old) =>
        old?.map((p) => (p.id === id ? { ...p, is_active } : p)) || []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['subscription_plans'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['subscription_plans'] }),
  });
}

// Duplicate a plan: clones all fields with "(cópia)" suffix and returns the new id
export function useDuplicatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plan: SubscriptionPlan) => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .insert({
          name: `${plan.name} (cópia)`,
          description: plan.description,
          monthly_price: plan.monthly_price,
          yearly_price: plan.yearly_price,
          max_users: plan.max_users,
          max_leads: plan.max_leads,
          max_whatsapp_instances: plan.max_whatsapp_instances,
          max_pipelines: plan.max_pipelines,
          features: plan.features as any,
          is_active: false, // start as draft
          display_order: (plan.display_order ?? 0) + 1,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription_plans'] }),
  });
}
