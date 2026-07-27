import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { subMonths, startOfMonth, endOfMonth, format } from 'date-fns';
import { appRangeToIso, getAppRangeForPreset, getAppToday, isIsoWithinAppRange } from '@/lib/appDate';

export interface DashboardStats {
  totalLeads: number;
  totalValue: number;
  messagesCount: number;
  conversionRate: number;
  leadsToday: number;
  leadsThisMonth: number;
  // Previous period for comparison
  prevTotalLeads: number;
  prevTotalValue: number;
  prevMessagesCount: number;
  prevConversionRate: number;
  prevLeadsToday: number;
  prevLeadsThisMonth: number;
  recentLeads: {
    id: string;
    name: string;
    value: number | null;
    status: string;
    created_at: string;
  }[];
  pipelineStats: {
    stage: string;
    count: number;
    color: string;
  }[];
  byMonth: { month: string; count: number; value: number }[];
  byStatus: Record<string, number>;
}

// Mock data for demonstration when no real data exists
function generateMockData(): DashboardStats {
  return {
    totalLeads: 247,
    totalValue: 384500,
    messagesCount: 89,
    conversionRate: 23.4,
    leadsToday: 12,
    leadsThisMonth: 68,
    prevTotalLeads: 210,
    prevTotalValue: 312000,
    prevMessagesCount: 72,
    prevConversionRate: 19.8,
    prevLeadsToday: 8,
    prevLeadsThisMonth: 54,
    recentLeads: [
      { id: '1', name: 'Maria Silva', value: 15000, status: 'qualified', created_at: new Date(Date.now() - 1800000).toISOString() },
      { id: '2', name: 'João Santos', value: 8500, status: 'proposal', created_at: new Date(Date.now() - 7200000).toISOString() },
      { id: '3', name: 'Ana Costa', value: 22000, status: 'new', created_at: new Date(Date.now() - 14400000).toISOString() },
      { id: '4', name: 'Pedro Oliveira', value: 5200, status: 'contacted', created_at: new Date(Date.now() - 28800000).toISOString() },
      { id: '5', name: 'Carla Ferreira', value: 31000, status: 'won', created_at: new Date(Date.now() - 86400000).toISOString() },
    ],
    pipelineStats: [
      { stage: 'Prospecção', count: 45, color: '#06b6d4' },
      { stage: 'Qualificação', count: 32, color: '#8b5cf6' },
      { stage: 'Proposta', count: 18, color: '#ec4899' },
      { stage: 'Negociação', count: 12, color: '#f59e0b' },
      { stage: 'Fechamento', count: 8, color: '#10b981' },
    ],
    byMonth: [
      { month: 'Out', count: 28, value: 42000 },
      { month: 'Nov', count: 35, value: 58000 },
      { month: 'Dez', count: 42, value: 71000 },
      { month: 'Jan', count: 38, value: 63000 },
      { month: 'Fev', count: 52, value: 82000 },
      { month: 'Mar', count: 68, value: 94500 },
    ],
    byStatus: {
      new: 45,
      contacted: 38,
      qualified: 32,
      proposal: 18,
      negotiation: 12,
      won: 58,
      lost: 44,
    },
  };
}

export function useDashboardStats() {
  const { profile, isMaster } = useAuth();

  return useQuery({
    queryKey: ['dashboard-stats', profile?.company_id, isMaster],
    queryFn: async (): Promise<DashboardStats> => {
      const now = getAppToday();
      const todayRange = getAppRangeForPreset('today');
      const yesterdayRange = getAppRangeForPreset('yesterday');
      const monthRange = getAppRangeForPreset('mtd');
      const { fromIso: todayStart, toIso: todayEnd } = appRangeToIso(todayRange);
      const { fromIso: yesterdayStart, toIso: yesterdayEnd } = appRangeToIso(yesterdayRange);
      const prevMonthRange = { from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) };

      // Fetch leads
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id, name, value, status, created_at, stage_id')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (leadsError) throw leadsError;

      // No mock fallback: respect real (possibly empty) DB state


      // Fetch stages (com stage_type para detectar won/lost reais)
      const { data: stages, error: stagesError } = await supabase
        .from('pipeline_stages')
        .select('id, name, color, stage_type')
        .order('position', { ascending: true });

      if (stagesError) throw stagesError;

      // Set de stages que representam ganho (cobre status legado + stage_type custom)
      const wonStageIds = new Set((stages || []).filter((s: any) => s.stage_type === 'won').map((s: any) => s.id));
      const isWon = (l: { status: string; stage_id: string | null }) =>
        l.status === 'won' || (!!l.stage_id && wonStageIds.has(l.stage_id));


      // Today's messages
      const { count: messagesCount } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd);

      // Yesterday's messages
      const { count: prevMessagesCount } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', yesterdayStart)
        .lte('created_at', yesterdayEnd);

      // Current stats
      const totalLeads = leads.length;
      const totalValue = leads.reduce((sum, l) => sum + (l.value || 0), 0);
      const wonLeads = leads.filter(isWon).length;
      const conversionRate = totalLeads > 0 ? (wonLeads / totalLeads) * 100 : 0;

      const leadsToday = leads.filter(l => isIsoWithinAppRange(l.created_at, todayRange)).length;

      const leadsThisMonth = leads.filter(l => isIsoWithinAppRange(l.created_at, monthRange)).length;

      // Previous period: leads created before current month
      const prevMonthLeads = leads.filter(l => isIsoWithinAppRange(l.created_at, prevMonthRange));
      const prevLeadsToday = leads.filter(l => isIsoWithinAppRange(l.created_at, yesterdayRange)).length;

      const monthStartTs = appRangeToIso(monthRange).fromIso;
      const prevTotalLeads = leads.filter(l => l.created_at < monthStartTs).length;
      const prevTotalValue = leads.filter(l => l.created_at < monthStartTs).reduce((s, l) => s + (l.value || 0), 0);
      const prevWon = leads.filter(l => l.created_at < monthStartTs && isWon(l)).length;
      const prevTotal = prevTotalLeads || 1;
      const prevConversionRate = (prevWon / prevTotal) * 100;

      // Recent leads
      const recentLeads = leads.slice(0, 5);

      // Pipeline stats
      const pipelineStats = (stages || []).map(stage => ({
        stage: stage.name,
        count: leads.filter(l => l.stage_id === stage.id).length,
        color: stage.color || '#6366f1',
      }));

      // By month (last 6)
      const byMonth: { month: string; count: number; value: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const md = subMonths(now, i);
        const s = startOfMonth(md);
        const e = endOfMonth(md);
        const ml = leads.filter(l => isIsoWithinAppRange(l.created_at, { from: s, to: e }));
        byMonth.push({ month: format(md, 'MMM'), count: ml.length, value: ml.reduce((a, l) => a + (l.value || 0), 0) });
      }

      // By status
      const byStatus: Record<string, number> = {};
      leads.forEach(l => { byStatus[l.status] = (byStatus[l.status] || 0) + 1; });

      return {
        totalLeads,
        totalValue,
        messagesCount: messagesCount || 0,
        conversionRate,
        leadsToday,
        leadsThisMonth,
        prevTotalLeads,
        prevTotalValue,
        prevMessagesCount: prevMessagesCount || 0,
        prevConversionRate,
        prevLeadsToday,
        prevLeadsThisMonth: prevMonthLeads.length,
        recentLeads,
        pipelineStats,
        byMonth,
        byStatus,
      };
    },
    enabled: !!profile,
  });
}
