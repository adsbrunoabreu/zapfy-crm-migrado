import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfDay, endOfDay, subDays, startOfYear, differenceInDays } from 'date-fns';
import type { MasterPeriod } from './useMasterDashboardData';

export interface AiKpis {
  addonsActive: number;
  addonsActivePrev: number;
  mrrAddon: number;
  messages: number;
  messagesPrev: number;
  cost: number;
  costPrev: number;
  runs: number;
  runsPrev: number;
  qualified: number;
  transferred: number;
  audios: number;
  errors: number;
  avgLatencyMs: number;
  qualificationRate: number;
  handoffRate: number;
  errorRate: number;
}

export interface AiSeriesPoint {
  day: string;
  runs: number;
  messages: number;
  cost: number;
  errors: number;
}

export interface AiTopCompany {
  id: string;
  name: string;
  logo_url: string | null;
  plan_status: string;
  runs: number;
  messages: number;
  cost: number;
  qualified: number;
  transferred: number;
  avg_latency_ms: number;
  addon_active: boolean;
  included: number;
  overage_price: number;
  monthly_price: number;
  blocked: boolean;
  blocked_reason: string | null;
  overage: number;
  projected_invoice: number;
}

export interface AiBlockedCompany {
  id: string;
  name: string;
  blocked_reason: string | null;
  blocked_at: string | null;
  blocked_until: string | null;
}

export interface AiModelDistribution {
  model: string;
  runs: number;
}

export interface AiKbStats {
  total: number;
  ready: number;
  processing: number;
  errors: number;
  sizeMb: number;
  companiesWithKb: number;
}

export interface AiOpportunity {
  id: string;
  name: string;
  plan_status: string;
  human_messages: number;
}

export interface MasterAiData {
  kpis: AiKpis;
  series: AiSeriesPoint[];
  topCompanies: AiTopCompany[];
  blocked: AiBlockedCompany[];
  models: AiModelDistribution[];
  kb: AiKbStats;
  opportunities: AiOpportunity[];
  period: { from: string; to: string };
}

function getRange(period: MasterPeriod, custom?: { from: Date; to: Date }) {
  const now = new Date();
  const to = endOfDay(now);
  let from: Date;
  switch (period) {
    case 'today': from = startOfDay(now); break;
    case '7d': from = startOfDay(subDays(now, 6)); break;
    case '30d': from = startOfDay(subDays(now, 29)); break;
    case '90d': from = startOfDay(subDays(now, 89)); break;
    case 'ytd': from = startOfYear(now); break;
    case 'custom':
      if (custom) return { from: startOfDay(custom.from), to: endOfDay(custom.to) };
      from = startOfDay(subDays(now, 29));
      break;
    default: from = startOfDay(subDays(now, 29));
  }
  return { from, to };
}

function getPrevRange(from: Date, to: Date) {
  const days = Math.max(1, differenceInDays(to, from) + 1);
  return { from: startOfDay(subDays(from, days)), to: endOfDay(subDays(to, days)) };
}

export function useMasterAiData(period: MasterPeriod, custom?: { from: Date; to: Date }) {
  const range = getRange(period, custom);
  const prev = getPrevRange(range.from, range.to);

  return useQuery({
    queryKey: ['master-ai-overview', period, range.from.toISOString(), range.to.toISOString()],
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<MasterAiData> => {
      const { data, error } = await (supabase as any).rpc('get_master_ai_overview', {
        _from: range.from.toISOString(),
        _to: range.to.toISOString(),
        _prev_from: prev.from.toISOString(),
        _prev_to: prev.to.toISOString(),
      });
      if (error) throw error;
      return data as MasterAiData;
    },
  });
}
