import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { appRangeToIso, getAppRangeForPreset, previousAppRange } from '@/lib/appDate';
import {
  computeClosingsKpis,
  computeLossReasons,
  makeIsWonLead,
  makeIsLostLead,
  type ClosingsKpi,
  type LeadRowLite,
  type LossReasonAgg,
  type PipelineStageLite,
  type DateRangeLite,
} from '@/lib/dashboardMetrics';

export type PeriodPreset = 'today' | 'yesterday' | '7d' | '15d' | '30d' | '60d' | '90d' | 'mtd' | 'ytd' | 'custom';

export interface DashboardFilters {
  period: PeriodPreset;
  customStart?: Date;
  customEnd?: Date;
  pipelineId?: string;
  status?: string;
  tagIds?: string[];
}

function getDateRange(filters: DashboardFilters): { start: Date; end: Date } {
  const range = filters.period === 'custom' && filters.customStart && filters.customEnd
    ? { from: filters.customStart, to: filters.customEnd }
    : getAppRangeForPreset(filters.period);
  return { start: range.from, end: range.to };
}

function getPreviousDateRange(start: Date, end: Date): { start: Date; end: Date } {
  const prev = previousAppRange({ from: start, to: end });
  return { start: prev.from, end: prev.to };
}

export interface MyDashboardStats {
  total: number;
  totalValue: number;
  /** Leads ganhos pelo membro com closed_at no período. */
  wonCount: number;
  /** Leads perdidos pelo membro com closed_at no período. */
  lostCount: number;
  pendingActivities: number;
  byStatus: Record<string, number>;
  recentLeads: Array<{
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    value: number | null;
    status: string;
    created_at: string;
    pipeline?: { name: string };
    stage?: { name: string };
  }>;
  byMonth: Array<{ month: string; leads: number; value: number }>;
  // Previous period for comparison
  prevTotal: number;
  prevTotalValue: number;
  prevWonCount: number;
  prevPendingActivities: number;
  // Closings (closed_at axis)
  closings: ClosingsKpi & { previous: ClosingsKpi };
  lossReasons: LossReasonAgg[];
}

async function fetchLeads(userId: string, start: Date, end: Date, pipelineId?: string, status?: string) {
  const { fromIso, toIso } = appRangeToIso({ from: start, to: end });
  let query = supabase
    .from('leads')
    .select(`id, name, phone, email, value, status, created_at, responded_at, assigned_to, stage_id, pipeline_id, closed_at, closed_by, loss_reason_id, loss_reason_text, pipeline:pipelines(name), stage:pipeline_stages(name)`)
    .eq('assigned_to', userId)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (pipelineId) query = query.eq('pipeline_id', pipelineId);
  if (status && status !== 'all') query = query.eq('status', status as any);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/** Leads do usuário fechados (closed_at) dentro do período — independe da data de criação. */
async function fetchClosedLeads(userId: string, start: Date, end: Date, pipelineId?: string) {
  const { fromIso, toIso } = appRangeToIso({ from: start, to: end });
  let query = supabase
    .from('leads')
    .select('id,status,value,created_at,responded_at,assigned_to,stage_id,pipeline_id,closed_at,closed_by,loss_reason_id,loss_reason_text')
    .eq('assigned_to', userId)
    .not('closed_at', 'is', null)
    .gte('closed_at', fromIso)
    .lte('closed_at', toIso)
    .limit(2000);
  if (pipelineId) query = query.eq('pipeline_id', pipelineId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as LeadRowLite[];
}

async function fetchLeadCount(userId: string, start: Date, end: Date) {
  const { fromIso, toIso } = appRangeToIso({ from: start, to: end });
  const { count, error } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_to', userId)
    .gte('created_at', fromIso)
    .lte('created_at', toIso);
  if (error) throw error;
  return count || 0;
}

async function fetchLeadValue(userId: string, start: Date, end: Date) {
  const { fromIso, toIso } = appRangeToIso({ from: start, to: end });
  const { data, error } = await supabase
    .from('leads')
    .select('value')
    .eq('assigned_to', userId)
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .limit(5000);
  if (error) throw error;
  return (data || []).reduce((sum, l) => sum + (l.value || 0), 0);
}

async function fetchPendingActivities(userId: string) {
  // Get all lead ids for user
  const { data: leads } = await supabase
    .from('leads')
    .select('id')
    .eq('assigned_to', userId)
    .limit(5000);
  const leadIds = (leads || []).map(l => l.id);
  if (leadIds.length === 0) return 0;

  const { count, error } = await (supabase as any)
    .from('scheduled_messages')
    .select('*', { count: 'exact', head: true })
    .in('lead_id', leadIds)
    .eq('status', 'pending');
  if (error) throw error;
  return count || 0;
}

async function fetchStages(): Promise<PipelineStageLite[]> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('id, stage_type');
  if (error) throw error;
  return (data || []) as PipelineStageLite[];
}

async function fetchLossReasonLabels(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('loss_reasons')
    .select('id, label');
  if (error) throw error;
  const map = new Map<string, string>();
  (data || []).forEach((r: any) => map.set(r.id, r.label));
  return map;
}

function periodKey(filters: DashboardFilters): DateRangeLite['period'] {
  switch (filters.period) {
    case 'today': return 'today';
    case 'yesterday': return 'yesterday';
    case '7d': return '7d';
    case '15d': return '15d';
    case '30d': return '30d';
    case '60d': return '60d';
    case '90d': return '90d';
    case 'mtd': return 'mtd';
    case 'ytd': return 'ytd';
    case 'custom': return 'custom';
    default: return '30d';
  }
}

export function useMyDashboardData(filters: DashboardFilters) {
  const { user } = useAuth();
  const { start, end } = getDateRange(filters);
  const prev = getPreviousDateRange(start, end);

  return useQuery({
    queryKey: ['my-dashboard-stats', user?.id, filters],
    queryFn: async (): Promise<MyDashboardStats> => {
      if (!user?.id) throw new Error('User not found');

      // If tag filter is active, fetch matching lead IDs first
      let tagFilteredLeadIds: string[] | null = null;
      if (filters.tagIds && filters.tagIds.length > 0) {
        const { data: tagLinks, error: tagErr } = await supabase
          .from('lead_tags')
          .select('lead_id')
          .in('tag_id', filters.tagIds);
        if (tagErr) throw tagErr;
        tagFilteredLeadIds = [...new Set((tagLinks || []).map(t => t.lead_id))];
        if (tagFilteredLeadIds.length === 0) {
          const emptyClosings: ClosingsKpi = {
            wonCount: 0, lostCount: 0, closedCount: 0, wonRevenue: 0, lostRevenue: 0,
            winRateClosed: 0, lossRate: 0, avgWonTicket: 0, avgCycleDays: 0,
          };
          return {
            total: 0, totalValue: 0, wonCount: 0, lostCount: 0,
            pendingActivities: 0, byStatus: {}, recentLeads: [], byMonth: [],
            prevTotal: 0, prevTotalValue: 0, prevWonCount: 0, prevPendingActivities: 0,
            closings: { ...emptyClosings, previous: emptyClosings },
            lossReasons: [],
          };
        }
      }

      // Current period
      const [leads, prevTotal, prevValue, pendingActivities, closedCurrent, closedPrev, stages, lossReasonLabels] = await Promise.all([
        fetchLeads(user.id, start, end, filters.pipelineId, filters.status),
        fetchLeadCount(user.id, prev.start, prev.end),
        fetchLeadValue(user.id, prev.start, prev.end),
        fetchPendingActivities(user.id),
        fetchClosedLeads(user.id, start, end, filters.pipelineId),
        fetchClosedLeads(user.id, prev.start, prev.end, filters.pipelineId),
        fetchStages(),
        fetchLossReasonLabels(),
      ]);

      // Apply tag filter client-side
      const filteredLeads = tagFilteredLeadIds
        ? leads.filter(l => tagFilteredLeadIds!.includes(l.id))
        : leads;
      const filteredClosedCurrent = tagFilteredLeadIds
        ? closedCurrent.filter(l => tagFilteredLeadIds!.includes(l.id))
        : closedCurrent;
      const filteredClosedPrev = tagFilteredLeadIds
        ? closedPrev.filter(l => tagFilteredLeadIds!.includes(l.id))
        : closedPrev;

      const total = filteredLeads.length;
      const totalValue = filteredLeads.reduce((sum, l) => sum + (l.value || 0), 0);
      const byStatus: Record<string, number> = {};
      filteredLeads.forEach(lead => {
        byStatus[lead.status] = (byStatus[lead.status] || 0) + 1;
      });

      // Build by month chart data (last 6 months from current data)
      const byMonth: Array<{ month: string; leads: number; value: number }> = [];
      for (let i = 5; i >= 0; i--) {
        const monthDate = subMonths(new Date(), i);
        const monthStart = startOfMonth(monthDate);
        const monthEnd = endOfMonth(monthDate);
        const monthLabel = format(monthDate, 'MMM', { locale: ptBR });

        const monthLeads = filteredLeads.filter(lead => {
          const createdAt = new Date(lead.created_at);
          return createdAt >= monthStart && createdAt <= monthEnd;
        });

        byMonth.push({
          month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
          leads: monthLeads.length,
          value: monthLeads.reduce((sum, l) => sum + (l.value || 0), 0),
        });
      }

      // ===== Closings (closed_at axis) =====
      const isWon = makeIsWonLead(stages);
      const isLost = makeIsLostLead(stages);
      const range: DateRangeLite = { startDate: start, endDate: end, period: periodKey(filters) };
      const prevRange: DateRangeLite = { startDate: prev.start, endDate: prev.end, period: periodKey(filters) };
      const closingsCur = computeClosingsKpis(filteredClosedCurrent, isWon, isLost, range);
      const closingsPrev = computeClosingsKpis(filteredClosedPrev, isWon, isLost, prevRange);
      const lossReasons = computeLossReasons(filteredClosedCurrent, isLost, range, lossReasonLabels);

      return {
        total,
        totalValue,
        wonCount: closingsCur.wonCount,
        lostCount: closingsCur.lostCount,
        pendingActivities,
        byStatus,
        recentLeads: filteredLeads.slice(0, 5) as MyDashboardStats['recentLeads'],
        byMonth,
        prevTotal,
        prevTotalValue: prevValue,
        prevWonCount: closingsPrev.wonCount,
        prevPendingActivities: 0,
        closings: { ...closingsCur, previous: closingsPrev },
        lossReasons,
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });
}
