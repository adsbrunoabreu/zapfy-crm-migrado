import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface RankingRow {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: string;
  joined_at: string;
  leads_count: number;
  value_won: number;
  conversions_count: number;
  responses_count: number;
  prev_leads_count: number;
  prev_value_won: number;
  prev_conversions_count: number;
  prev_responses_count: number;
  target_leads: number;
  target_value: number;
  target_conversions: number;
}

export type RankingMetric = 'leads' | 'value' | 'conversions' | 'responses';

export function metricValue(r: RankingRow, m: RankingMetric): number {
  switch (m) {
    case 'leads': return Number(r.leads_count) || 0;
    case 'value': return Number(r.value_won) || 0;
    case 'conversions': return Number(r.conversions_count) || 0;
    case 'responses': return Number(r.responses_count) || 0;
  }
}

export function metricPrev(r: RankingRow, m: RankingMetric): number {
  switch (m) {
    case 'leads': return Number(r.prev_leads_count) || 0;
    case 'value': return Number(r.prev_value_won) || 0;
    case 'conversions': return Number(r.prev_conversions_count) || 0;
    case 'responses': return Number(r.prev_responses_count) || 0;
  }
}

export function metricTarget(r: RankingRow, m: RankingMetric): number {
  switch (m) {
    case 'leads': return Number(r.target_leads) || 0;
    case 'value': return Number(r.target_value) || 0;
    case 'conversions': return Number(r.target_conversions) || 0;
    case 'responses': return 0;
  }
}

export function useRankings(periodStart: string, periodEnd: string) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['user-rankings', profile?.company_id, periodStart, periodEnd],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_rankings', {
        _period_start: periodStart,
        _period_end: periodEnd,
      });
      if (error) throw error;
      return (data ?? []) as RankingRow[];
    },
    enabled: !!profile?.company_id && !!periodStart && !!periodEnd,
    staleTime: 2 * 60 * 1000,
  });
}
