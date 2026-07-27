import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type OnboardingStepKey = 'company' | 'whatsapp' | 'pipeline' | 'team' | 'plan';

export interface OnboardingState {
  company_id: string;
  current_step: number;
  completed_steps: OnboardingStepKey[];
  completed_at: string | null;
  skipped: boolean;
}

export function useOnboarding() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['company-onboarding', profile?.company_id],
    enabled: !!profile?.company_id,
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<OnboardingState | null> => {
      const { data, error } = await (supabase as any)
        .from('company_onboarding')
        .select('*')
        .eq('company_id', profile!.company_id)
        .maybeSingle();
      if (error) throw error;
      return data as OnboardingState | null;
    },
  });
}

export function useUpdateOnboarding() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<OnboardingState, 'current_step' | 'completed_steps' | 'completed_at' | 'skipped'>>) => {
      if (!profile?.company_id) throw new Error('Sem empresa');
      const { error } = await (supabase as any)
        .from('company_onboarding')
        .update(patch)
        .eq('company_id', profile.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-onboarding'] });
    },
  });
}

export function useMarkOnboardingStepDone() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (step: OnboardingStepKey) => {
      if (!profile?.company_id) throw new Error('Sem empresa');
      const { data: current } = await (supabase as any)
        .from('company_onboarding')
        .select('completed_steps, current_step')
        .eq('company_id', profile.company_id)
        .maybeSingle();
      const completed: OnboardingStepKey[] = current?.completed_steps || [];
      if (!completed.includes(step)) completed.push(step);
      const { error } = await (supabase as any)
        .from('company_onboarding')
        .update({ completed_steps: completed })
        .eq('company_id', profile.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['company-onboarding'] });
    },
  });
}
