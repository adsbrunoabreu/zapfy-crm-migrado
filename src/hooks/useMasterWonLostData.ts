import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subDays } from 'date-fns';
import type { MasterPeriod } from '@/hooks/useMasterDashboardData';

export interface WonLostGlobal {
  won_count: number;
  lost_count: number;
  closed_count: number;
  won_revenue: number;
  lost_revenue: number;
  win_rate: number;
  loss_rate: number;
  companies_with_closings: number;
}

export interface WonLostReason {
  label: string;
  count: number;
  total_value: number;
  percentage: number;
}

export interface WonLostCompany {
  company_id: string;
  company_name: string;
  won_count: number;
  lost_count: number;
  closed_count: number;
  won_revenue: number;
  lost_revenue: number;
  win_rate: number;
  loss_rate: number;
  top_loss_reasons: { label: string; count: number }[];
}

export interface MasterWonLostData {
  global: WonLostGlobal;
  top_loss_reasons: WonLostReason[];
  companies: WonLostCompany[];
}

import { getRangeFromPeriod } from '@/hooks/useMasterDashboardData';

function resolveRange(period: MasterPeriod, custom?: { from: Date; to: Date }) {
  return getRangeFromPeriod(period, custom);
}

export function useMasterWonLostData(period: MasterPeriod, custom?: { from: Date; to: Date }) {
  const { from, to } = resolveRange(period, custom);
  return useQuery({
    queryKey: ['master-won-lost', period, from.toISOString(), to.toISOString()],
    queryFn: async (): Promise<MasterWonLostData> => {
      const { data, error } = await (supabase as any).rpc('get_master_won_lost_overview', {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw error;
      const d = (data || {}) as any;
      return {
        global: d.global || {
          won_count: 0, lost_count: 0, closed_count: 0,
          won_revenue: 0, lost_revenue: 0, win_rate: 0, loss_rate: 0,
          companies_with_closings: 0,
        },
        top_loss_reasons: d.top_loss_reasons || [],
        companies: d.companies || [],
      };
    },
    staleTime: 2 * 60 * 1000,
  });
}
