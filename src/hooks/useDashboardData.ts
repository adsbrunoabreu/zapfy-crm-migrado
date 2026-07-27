import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { appRangeToIso, getAppRangeForPreset, previousAppRange, type AppDateRange } from '@/lib/appDate';
import {
  computeKpis as computeKpisPure,
  fillEvolutionBuckets,
  fillClosingsIntoBuckets,
  fillReopenedIntoBuckets,
  computeClosingsKpis,
  computeLossReasons,
  makeIsWonLead,
  makeIsLostLead,
  type ClosingsKpi,
  type LossReasonAgg,
} from '@/lib/dashboardMetrics';

export type DashboardPeriod = 'today' | 'yesterday' | '7d' | '15d' | '30d' | '60d' | '90d' | 'mtd' | 'ytd' | 'custom';

export interface DateRange {
  startDate: Date;
  endDate: Date;
  period: DashboardPeriod;
}

export function getRangeForPeriod(period: DashboardPeriod, custom?: { from: Date; to: Date }): DateRange {
  const range: AppDateRange = period === 'custom' && custom ? custom : getAppRangeForPreset(period);
  return { period, startDate: range.from, endDate: range.to };
}

export interface KpiMetric { current: number; previous: number; }

export interface TeamMemberPerf {
  user_id: string | null;
  name: string;
  avatar_url: string | null;
  total_leads: number;
  converted: number;
  conversion_rate: number;
  avg_ticket: number;
  avg_response_hours: number;
  responded_count: number;
  /** Leads ganhos pelo membro com closed_at no período. */
  closed_won: number;
  /** Leads perdidos pelo membro com closed_at no período. */
  closed_lost: number;
  /** Win rate sobre leads fechados no período. */
  win_rate_closed: number;
  /** Receita ganha (valor de leads ganhos no período). */
  won_revenue: number;
  /** Ciclo médio dos leads ganhos do membro (dias). */
  avg_cycle_days: number;
}

export type StageType = 'open' | 'won' | 'lost' | 'unassigned';

export interface StageBreakdown {
  /** Identificador estável (stage_id ou 'unassigned') — mantido em `status` p/ compat. */
  status: string;
  stage_id: string | null;
  stage_type: StageType;
  position: number;
  label: string;
  color: string;
  count: number;
  total_value: number;
}

export interface EvolutionBucket {
  label: string;
  count: number;
  messages: number;
  won: number;
  closedWon: number;
  closedLost: number;
  reopened: number;
}

export interface DashboardData {
  totalLeads: KpiMetric;
  revenue: KpiMetric;
  conversionRate: KpiMetric;
  avgTicket: KpiMetric;
  messages: KpiMetric;
  avgResponseHours: KpiMetric;
  // ===== Novos KPIs (10 cards do painel) =====
  pipelineValue: KpiMetric;
  winRate: KpiMetric;
  avgWonTicket: KpiMetric;
  avgCycleDays: KpiMetric;
  stageConversionAvg: KpiMetric;
  stagnantLeads: KpiMetric;
  wonRevenue: KpiMetric;
  salesProductivity: KpiMetric;
  activeAgents: number;
  evolution: EvolutionBucket[];
  stages: StageBreakdown[];
  team: TeamMemberPerf[];
  truncated: boolean;
  closings: ClosingsKpi & { previous: ClosingsKpi };
  lossReasons: LossReasonAgg[];
  reopenedCount: number;
  prevReopenedCount: number;
}

interface LeadRow {
  id: string;
  status: string;
  value: number | null;
  created_at: string;
  responded_at: string | null;
  assigned_to: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  closed_at: string | null;
  closed_by: string | null;
  loss_reason_id: string | null;
  loss_reason_text: string | null;
}

interface PipelineStageRow {
  id: string;
  pipeline_id: string;
  name: string;
  color: string | null;
  position: number;
  stage_type: StageType;
}

export function useDashboardData(range: DateRange, pipelineId?: string) {
  const { profile, isMaster } = useAuth();
  const companyId = profile?.company_id;

  return useQuery({
    queryKey: ['executive-dashboard', companyId, pipelineId || 'all', range.startDate.toISOString(), range.endDate.toISOString()],
    enabled: !!profile && (!!companyId || isMaster),
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<DashboardData> => {
      const { fromIso: startISO, toIso: endISO } = appRangeToIso({ from: range.startDate, to: range.endDate });
      const prevRange = previousAppRange({ from: range.startDate, to: range.endDate });
      const { fromIso: prevStartISO, toIso: prevEndISO } = appRangeToIso(prevRange);

      const fetchLeads = async (from: string, to: string): Promise<LeadRow[]> => {
        let q = supabase
          .from('leads')
          .select('id,status,value,created_at,responded_at,assigned_to,stage_id,pipeline_id,closed_at,closed_by,loss_reason_id,loss_reason_text')
          .gte('created_at', from)
          .lte('created_at', to)
          .order('created_at', { ascending: false })
          .limit(5000);
        if (companyId) q = q.eq('company_id', companyId);
        if (pipelineId) q = q.eq('pipeline_id', pipelineId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as LeadRow[];
      };

      /** Leads fechados (closed_at) dentro do período — independente de quando foram criados. */
      const fetchClosedLeads = async (from: string, to: string): Promise<LeadRow[]> => {
        let q = supabase
          .from('leads')
          .select('id,status,value,created_at,responded_at,assigned_to,stage_id,pipeline_id,closed_at,closed_by,loss_reason_id,loss_reason_text')
          .not('closed_at', 'is', null)
          .gte('closed_at', from)
          .lte('closed_at', to)
          .order('closed_at', { ascending: false })
          .limit(5000);
        if (companyId) q = q.eq('company_id', companyId);
        if (pipelineId) q = q.eq('pipeline_id', pipelineId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as LeadRow[];
      };

      const fetchStages = async (): Promise<PipelineStageRow[]> => {
        let q = supabase
          .from('pipeline_stages')
          .select('id,pipeline_id,name,color,position,stage_type,pipelines!inner(company_id)')
          .order('position', { ascending: true });
        if (companyId) q = q.eq('pipelines.company_id', companyId);
        if (pipelineId) q = q.eq('pipeline_id', pipelineId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as unknown as PipelineStageRow[];
      };

      const fetchLossReasons = async (): Promise<Map<string, string>> => {
        if (!companyId) return new Map();
        const { data } = await supabase
          .from('loss_reasons')
          .select('id,label')
          .eq('company_id', companyId)
          .limit(200);
        const m = new Map<string, string>();
        (data || []).forEach((r: any) => m.set(r.id, r.label));
        return m;
      };

      const fetchMsgCount = async (from: string, to: string) => {
        let q = supabase
          .from('chat_messages')
          .select('id', { count: 'exact', head: true })
          .eq('from_me', true)
          .gte('created_at', from)
          .lte('created_at', to);
        if (companyId) q = q.eq('company_id', companyId);
        const { count, error } = await q;
        if (error) throw error;
        return count || 0;
      };

      const fetchMsgsForBuckets = async (from: string, to: string): Promise<{ created_at: string }[]> => {
        let q = supabase
          .from('chat_messages')
          .select('created_at')
          .eq('from_me', true)
          .gte('created_at', from)
          .lte('created_at', to)
          .order('created_at', { ascending: true })
          .limit(10000);
        if (companyId) q = q.eq('company_id', companyId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as { created_at: string }[];
      };

      const fetchReopenedEvents = async (from: string, to: string): Promise<{ created_at: string }[]> => {
        let q = supabase
          .from('lead_activities')
          .select('created_at')
          .eq('action_type', 'lead_reopened')
          .gte('created_at', from)
          .lte('created_at', to)
          .order('created_at', { ascending: true })
          .limit(5000);
        if (companyId) q = q.eq('company_id', companyId);
        const { data, error } = await q;
        if (error) throw error;
        return (data || []) as { created_at: string }[];
      };

      const fetchStagnantCount = async (refDate: Date, leadFromIso: string, leadToIso: string): Promise<number> => {
        const cutoff = new Date(refDate.getTime() - 14 * 86400000).toISOString();
        let q = supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .in('status', ['new', 'contacted', 'qualified', 'proposal', 'negotiation'])
          .lte('updated_at', cutoff)
          .gte('created_at', leadFromIso)
          .lte('created_at', leadToIso);
        if (companyId) q = q.eq('company_id', companyId);
        if (pipelineId) q = q.eq('pipeline_id', pipelineId);
        const { count } = await q;
        return count || 0;
      };

      const fetchActiveAgents = async (): Promise<number> => {
        if (!companyId) return 0;
        const { count } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('is_active', true);
        return count || 0;
      };

      const [
        currentLeads,
        previousLeads,
        closedCurrent,
        closedPrevious,
        stagesDef,
        lossReasonLabels,
        msgCurrent,
        msgPrev,
        msgsForBuckets,
        reopenedCurrent,
        reopenedPrev,
        stagnantCur,
        stagnantPrev,
        activeAgents,
      ] = await Promise.all([
        fetchLeads(startISO, endISO),
        fetchLeads(prevStartISO, prevEndISO),
        fetchClosedLeads(startISO, endISO),
        fetchClosedLeads(prevStartISO, prevEndISO),
        fetchStages(),
        fetchLossReasons(),
        fetchMsgCount(startISO, endISO),
        fetchMsgCount(prevStartISO, prevEndISO),
        fetchMsgsForBuckets(startISO, endISO),
        fetchReopenedEvents(startISO, endISO),
        fetchReopenedEvents(prevStartISO, prevEndISO),
        fetchStagnantCount(range.endDate, startISO, endISO),
        fetchStagnantCount(prevRange.to, prevStartISO, prevEndISO),
        fetchActiveAgents(),
      ]);

      // ===== KPIs ===== (puro, testado em src/lib/dashboardMetrics.test.ts)
      const isWonLead = makeIsWonLead(stagesDef);
      const isLostLead = makeIsLostLead(stagesDef);
      const cur = computeKpisPure(currentLeads, isWonLead);
      const prev = computeKpisPure(previousLeads, isWonLead);

      // ===== KPIs de fechamento (eixo closed_at) =====
      const closingsCur = computeClosingsKpis(closedCurrent, isWonLead, isLostLead, range);
      const closingsPrev = computeClosingsKpis(
        closedPrevious,
        isWonLead,
        isLostLead,
        { ...range, startDate: prevRange.from, endDate: prevRange.to },
      );

      // ===== Stages =====
      const stageAcc = new Map<string, { count: number; total_value: number }>();
      let unassignedCount = 0;
      let unassignedValue = 0;

      currentLeads.forEach(l => {
        if (!l.stage_id) {
          unassignedCount++;
          unassignedValue += l.value || 0;
          return;
        }
        const e = stageAcc.get(l.stage_id) || { count: 0, total_value: 0 };
        e.count++;
        e.total_value += l.value || 0;
        stageAcc.set(l.stage_id, e);
      });

      const stages: StageBreakdown[] = stagesDef.map(s => {
        const agg = stageAcc.get(s.id) || { count: 0, total_value: 0 };
        return {
          status: s.id,
          stage_id: s.id,
          stage_type: s.stage_type,
          position: s.position,
          label: s.name,
          color: s.color || '#6366f1',
          count: agg.count,
          total_value: agg.total_value,
        };
      });

      if (unassignedCount > 0) {
        stages.push({
          status: 'unassigned',
          stage_id: null,
          stage_type: 'unassigned',
          position: 9999,
          label: 'Sem etapa',
          color: '#6b7280',
          count: unassignedCount,
          total_value: unassignedValue,
        });
      }

      // ===== Equipe =====
      // total/converted/avg_response_hours: por leads CRIADOS no período (assigned_to)
      // closed_won/closed_lost/won_revenue/avg_cycle_days: por leads FECHADOS no período (closed_by → fallback assigned_to)
      const teamMap = new Map<string, { total: number; won: number; revenue: number; respMs: number; respCount: number }>();
      currentLeads.forEach(l => {
        const k = l.assigned_to || 'unassigned';
        const e = teamMap.get(k) || { total: 0, won: 0, revenue: 0, respMs: 0, respCount: 0 };
        e.total++;
        if (isWonLead(l)) e.won++;
        e.revenue += l.value || 0;
        if (l.responded_at) {
          const ms = new Date(l.responded_at).getTime() - new Date(l.created_at).getTime();
          if (ms >= 0) {
            e.respMs += ms;
            e.respCount++;
          }
        }
        teamMap.set(k, e);
      });

      const closersMap = new Map<string, { won: number; lost: number; wonRevenue: number; cycleMs: number; cycleCount: number }>();
      closedCurrent.forEach(l => {
        const k = l.closed_by || l.assigned_to || 'unassigned';
        const e = closersMap.get(k) || { won: 0, lost: 0, wonRevenue: 0, cycleMs: 0, cycleCount: 0 };
        const won = isWonLead(l);
        const lost = isLostLead(l);
        if (won) {
          e.won++;
          e.wonRevenue += l.value || 0;
          if (l.closed_at) {
            const ms = new Date(l.closed_at).getTime() - new Date(l.created_at).getTime();
            if (ms >= 0) {
              e.cycleMs += ms;
              e.cycleCount++;
            }
          }
        } else if (lost) {
          e.lost++;
        }
        closersMap.set(k, e);
        // garantir que membros que só fecharam (sem leads criados) também apareçam
        if (!teamMap.has(k)) {
          teamMap.set(k, { total: 0, won: 0, revenue: 0, respMs: 0, respCount: 0 });
        }
      });

      const userIds = Array.from(teamMap.keys()).filter(k => k !== 'unassigned');
      const profilesMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id,full_name,avatar_url')
          .in('id', userIds);
        (profs || []).forEach(p => profilesMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url }));
      }

      const team: TeamMemberPerf[] = Array.from(teamMap.entries()).map(([uid, v]) => {
        const p = uid !== 'unassigned' ? profilesMap.get(uid) : null;
        const c = closersMap.get(uid) || { won: 0, lost: 0, wonRevenue: 0, cycleMs: 0, cycleCount: 0 };
        const closedTotal = c.won + c.lost;
        return {
          user_id: uid === 'unassigned' ? null : uid,
          name: uid === 'unassigned' ? 'Sem responsável' : (p?.full_name || 'Usuário'),
          avatar_url: p?.avatar_url || null,
          total_leads: v.total,
          converted: v.won,
          conversion_rate: v.total > 0 ? (v.won / v.total) * 100 : 0,
          avg_ticket: v.total > 0 ? v.revenue / v.total : 0,
          avg_response_hours: v.respCount > 0 ? (v.respMs / v.respCount) / 3600000 : 0,
          responded_count: v.respCount,
          closed_won: c.won,
          closed_lost: c.lost,
          win_rate_closed: closedTotal > 0 ? (c.won / closedTotal) * 100 : 0,
          won_revenue: c.wonRevenue,
          avg_cycle_days: c.cycleCount > 0 ? (c.cycleMs / c.cycleCount) / 86400000 : 0,
        };
      }).sort((a, b) => b.conversion_rate - a.conversion_rate);

      // ===== Evolução (puro) =====
      const evolutionBuckets = fillEvolutionBuckets(range, currentLeads, msgsForBuckets, isWonLead);
      fillClosingsIntoBuckets(range, evolutionBuckets, closedCurrent, isWonLead, isLostLead);
      fillReopenedIntoBuckets(range, evolutionBuckets, reopenedCurrent);
      const evolution: EvolutionBucket[] = evolutionBuckets.map(b => ({
        label: b.label,
        count: b.count,
        messages: b.messages,
        won: b.won,
        closedWon: b.closedWon,
        closedLost: b.closedLost,
        reopened: b.reopened,
      }));

      // ===== Motivos de perda =====
      const lossReasons = computeLossReasons(closedCurrent, isLostLead, range, lossReasonLabels);

      // ===== Pipeline value (open stages) =====
      const openStageIds = new Set(stagesDef.filter(s => s.stage_type === 'open').map(s => s.id));
      const computePipelineValue = (rows: LeadRow[]) =>
        rows.reduce((sum, l) => (l.stage_id && openStageIds.has(l.stage_id) ? sum + (l.value || 0) : sum), 0);
      const pipelineValueCur = computePipelineValue(currentLeads);
      const pipelineValuePrev = computePipelineValue(previousLeads);

      // ===== Conversão média entre etapas (open consecutivas, por pipeline) =====
      const computeStageConvAvg = (rows: LeadRow[]): number => {
        const byPipe = new Map<string, PipelineStageRow[]>();
        stagesDef.filter(s => s.stage_type === 'open').forEach(s => {
          const arr = byPipe.get(s.pipeline_id) || [];
          arr.push(s);
          byPipe.set(s.pipeline_id, arr);
        });
        const counts = new Map<string, number>();
        rows.forEach(l => {
          if (!l.stage_id) return;
          counts.set(l.stage_id, (counts.get(l.stage_id) || 0) + 1);
        });
        const ratios: number[] = [];
        byPipe.forEach(arr => {
          const sorted = arr.sort((a, b) => a.position - b.position);
          for (let i = 0; i < sorted.length - 1; i++) {
            const from = counts.get(sorted[i].id) || 0;
            const to = counts.get(sorted[i + 1].id) || 0;
            if (from > 0) ratios.push(Math.min(1, to / from) * 100);
          }
        });
        if (ratios.length === 0) return 0;
        return ratios.reduce((a, b) => a + b, 0) / ratios.length;
      };
      const stageConvCur = computeStageConvAvg(currentLeads);
      const stageConvPrev = computeStageConvAvg(previousLeads);

      // ===== Produtividade =====
      const agentsBase = activeAgents > 0 ? activeAgents : 1;
      const productivityCur = closingsCur.wonCount / agentsBase;
      const productivityPrev = closingsPrev.wonCount / agentsBase;

      return {
        totalLeads: { current: cur.total, previous: prev.total },
        revenue: { current: cur.revenue, previous: prev.revenue },
        conversionRate: { current: cur.conversionRate, previous: prev.conversionRate },
        avgTicket: { current: cur.avgTicket, previous: prev.avgTicket },
        messages: { current: msgCurrent, previous: msgPrev },
        avgResponseHours: { current: cur.avgResponseHours, previous: prev.avgResponseHours },
        pipelineValue: { current: pipelineValueCur, previous: pipelineValuePrev },
        winRate: { current: closingsCur.winRateClosed, previous: closingsPrev.winRateClosed },
        avgWonTicket: { current: closingsCur.avgWonTicket, previous: closingsPrev.avgWonTicket },
        avgCycleDays: { current: closingsCur.avgCycleDays, previous: closingsPrev.avgCycleDays },
        stageConversionAvg: { current: stageConvCur, previous: stageConvPrev },
        stagnantLeads: { current: stagnantCur, previous: stagnantPrev },
        wonRevenue: { current: closingsCur.wonRevenue, previous: closingsPrev.wonRevenue },
        salesProductivity: { current: productivityCur, previous: productivityPrev },
        activeAgents,
        evolution,
        stages,
        team,
        truncated: currentLeads.length >= 5000,
        closings: { ...closingsCur, previous: closingsPrev },
        lossReasons,
        reopenedCount: reopenedCurrent.length,
        prevReopenedCount: reopenedPrev.length,
      };
    },
  });
}
