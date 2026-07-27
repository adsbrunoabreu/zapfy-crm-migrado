import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { DreReport, DreSection } from '@/lib/dre';

export type DreBasis = 'competencia' | 'caixa';
export type DreFilters = {
  doctor_id?: string | null;
  insurance_id?: string | null;
  facility_id?: string | null;
  category_id?: string | null;
  cost_center_id?: string | null;
};

const toIso = (d: Date) => d.toISOString().slice(0, 10);

const normalizeReport = (raw: any): DreReport => {
  const r = (raw && typeof raw === 'object') ? raw : {};
  return {
    period: r.period ?? { start: '', end: '', basis: 'competencia' },
    sections: (r.sections && typeof r.sections === 'object') ? r.sections : {},
    categories: Array.isArray(r.categories) ? r.categories : [],
  } as DreReport;
};

export function useDREReport(from: Date, to: Date, basis: DreBasis, filters: DreFilters) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  return useQuery({
    queryKey: ['dre', 'report', companyId, toIso(from), toIso(to), basis, filters],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<DreReport> => {
      const { data, error } = await supabase.rpc('get_dre_report', {
        _company_id: companyId!,
        _period_start: toIso(from),
        _period_end: toIso(to),
        _basis: basis,
        _filters: filters as any,
      });
      if (error) throw error;
      return normalizeReport(data);
    },
  });
}

export function useDREComparison(from: Date, to: Date, basis: DreBasis, filters: DreFilters) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  return useQuery({
    queryKey: ['dre', 'compare', companyId, toIso(from), toIso(to), basis, filters],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<{ current: DreReport; previous: DreReport }> => {
      const { data, error } = await supabase.rpc('get_dre_comparison', {
        _company_id: companyId!,
        _period_start: toIso(from),
        _period_end: toIso(to),
        _basis: basis,
        _filters: filters as any,
      });
      if (error) throw error;
      const d = (data as any) ?? {};
      return { current: normalizeReport(d.current), previous: normalizeReport(d.previous) };
    },
  });
}

export function useDREInsights(from: Date, to: Date, basis: DreBasis, filters: DreFilters) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  return useQuery({
    queryKey: ['dre', 'insights', companyId, toIso(from), toIso(to), basis, filters],
    enabled: !!companyId,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<Array<{ type: string; message: string }>> => {
      const { data, error } = await supabase.rpc('get_dre_insights', {
        _company_id: companyId!,
        _period_start: toIso(from),
        _period_end: toIso(to),
        _basis: basis,
        _filters: filters as any,
      });
      if (error) throw error;
      return (data as any) ?? [];
    },
  });
}

export function useDREDrillDown(opts: {
  enabled: boolean; section: DreSection | null; categoryId: string | null;
  from: Date; to: Date; basis: DreBasis;
}) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  return useQuery({
    queryKey: ['dre', 'drill', companyId, opts.section, opts.categoryId, toIso(opts.from), toIso(opts.to), opts.basis],
    enabled: !!companyId && !!opts.section && opts.enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_dre_drill_down', {
        _company_id: companyId!,
        _section: opts.section as any,
        _category_id: opts.categoryId,
        _period_start: toIso(opts.from),
        _period_end: toIso(opts.to),
        _basis: opts.basis,
      });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });
}
