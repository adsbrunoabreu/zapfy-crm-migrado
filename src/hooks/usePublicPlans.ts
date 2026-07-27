import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PublicPlan {
  id: string;
  name: string;
  description: string | null;
  monthly_price: number;
  yearly_price: number;
  features: string[];
  is_featured: boolean;
  display_order: number;
}

export function usePublicPlans() {
  return useQuery({
    queryKey: ['public_subscription_plans'],
    queryFn: async (): Promise<PublicPlan[]> => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id,name,description,monthly_price,yearly_price,features,is_featured,display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data || []).map((p: any) => ({
        ...p,
        features: Array.isArray(p.features) ? p.features : [],
      }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
