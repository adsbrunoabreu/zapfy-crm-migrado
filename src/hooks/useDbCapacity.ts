import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TopTable {
  table_name: string;
  total_bytes: number;
  table_bytes: number;
  index_bytes: number;
  live_rows: number;
  dead_rows: number;
  bloat_pct: number;
}

export interface DatabaseOverview {
  total_bytes: number;
  table_count: number;
  active_connections: number;
  dead_tuples_total: number;
  top_tables: TopTable[];
  generated_at: string;
}

export interface CompanyUsage {
  company_id: string;
  company_name: string;
  company_status: string;
  plan_name: string;
  leads_count: number;
  messages_count: number;
  conversations_count: number;
  appointments_count: number;
  products_count: number;
  orders_count: number;
  logs_count: number;
  media_bytes: number;
  estimated_total_bytes: number;
}

export interface CompanyUsageOverview {
  companies: CompanyUsage[];
  total_media_bytes: number;
  generated_at: string;
}

export interface GrowthPoint {
  date: string;
  leads: number;
  messages: number;
  orders: number;
}

export interface CompanyGrowth {
  company_id: string;
  days: number;
  series: GrowthPoint[];
  generated_at: string;
}

export function useDatabaseOverview() {
  return useQuery({
    queryKey: ['db-capacity', 'overview'],
    queryFn: async (): Promise<DatabaseOverview> => {
      const { data, error } = await (supabase.rpc as any)('get_database_overview');
      if (error) throw error;
      return data as DatabaseOverview;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useCompanyUsageOverview() {
  return useQuery({
    queryKey: ['db-capacity', 'companies'],
    queryFn: async (): Promise<CompanyUsageOverview> => {
      const { data, error } = await (supabase.rpc as any)('get_company_usage_overview');
      if (error) throw error;
      return data as CompanyUsageOverview;
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useCompanyGrowth(companyId: string | null, days = 30) {
  return useQuery({
    queryKey: ['db-capacity', 'growth', companyId, days],
    queryFn: async (): Promise<CompanyGrowth> => {
      const { data, error } = await (supabase.rpc as any)('get_company_growth', {
        _company_id: companyId,
        _days: days,
      });
      if (error) throw error;
      return data as CompanyGrowth;
    },
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: value >= 100 ? 0 : 1 })} ${units[i]}`;
}

export function formatNumber(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('pt-BR');
}
