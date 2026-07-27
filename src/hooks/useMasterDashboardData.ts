import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  subDays, endOfMonth,
  subMonths, format, differenceInDays, eachDayOfInterval, eachWeekOfInterval,
  eachMonthOfInterval, isWithinInterval,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { validateChurnInputs, logChurnReport, type ChurnValidationReport } from '@/lib/churnValidation';
import {
  scoreCompany, daysSinceLastLead, loadAtRiskConfig,
  type AtRiskConfig, type AtRiskScoreResult,
} from '@/lib/atRiskScoring';
import {
  scoreUpsell, loadUpsellConfig,
  type UpsellConfig, type UpsellScoreResult,
} from '@/lib/upsellScoring';
import { appRangeToIso, endOfAppDay, getAppRangeForPreset, getAppToday, previousAppRange, startOfAppMonth } from '@/lib/appDate';

export type MasterPeriod = 'today' | 'yesterday' | '7d' | '15d' | '30d' | '60d' | '90d' | 'mtd' | 'ytd' | 'custom';

export interface MasterDashboardKpis {
  mrr: number;
  prevMrr: number;
  arr: number;
  prevArr: number;
  churnRate: number;
  prevChurnRate: number;
  retentionRate: number;
  nrr: number;
  totalCompanies: number;
  newCompanies: number;
  prevNewCompanies: number;
  activeCompanies: number;
  trialCompanies: number;
  suspendedCompanies: number;
  canceledCompanies: number;
  totalLeads: number;
  prevTotalLeads: number;
  avgTicket: number;
  prevAvgTicket: number;
  messagesPeriod: number;
  prevMessagesPeriod: number;
  utilizationRate: number;
}

export interface MrrPoint { label: string; mrr: number; }
export interface CompanyGrowthPoint { label: string; novas: number; acumulado: number; }
export interface PlanSlice { plan: string; companies: number; mrr: number; pct: number; }
export interface TopCompanyRow {
  id: string;
  name: string;
  logo_url: string | null;
  leadsPeriod: number;
  leadsPrev: number;
  mrr: number;
  arr: number;
  created_at: string;
  plan_status: string;
}
export interface AtRiskRow {
  id: string;
  name: string;
  reason: string;
  severity: 'medium' | 'high';
  score: number;
  factors: AtRiskScoreResult['factors'];
  mrr: number;
  leadsPeriod: number;
  leadsPrev: number;
  daysSinceLastLead: number | null;
  planStatus: string;
}
export interface UpsellRow {
  id: string;
  name: string;
  currentPlanName: string;
  targetPlanName: string;
  leads: number;
  leadsPrev: number;
  currentMrr: number;
  targetMrr: number;
  potential: number;       // ganho mensal estimado
  potentialAnnual: number; // ARR uplift
  score: number;
  category: 'warm' | 'hot';
  factors: UpsellScoreResult['factors'];
  topReason: string;
  whatsappUsage: { used: number; max: number | null };
  leadsUsage: { used: number; max: number | null };
}

export interface MasterDashboardData {
  kpis: MasterDashboardKpis;
  mrrSeries: MrrPoint[];
  companyGrowth: CompanyGrowthPoint[];
  planDistribution: PlanSlice[];
  topCompanies: TopCompanyRow[];
  atRisk: AtRiskRow[];
  upsell: UpsellRow[];
  churnByMonth: { month: string; rate: number }[];
  range: { from: Date; to: Date };
  prevRange: { from: Date; to: Date };
  validation: ChurnValidationReport;
}

export function getRangeFromPeriod(period: MasterPeriod, custom?: { from: Date; to: Date }) {
  if (period === 'custom' && custom) return custom;
  return getAppRangeForPreset(period);
}

function getPrevRange(from: Date, to: Date) {
  return previousAppRange({ from, to });
}

function monthlyValueOf(s: any) {
  const v = Number(s.monthly_price) || 0;
  return s.billing_cycle === 'yearly' ? v / 12 : v;
}

/**
 * MRR ativo em uma data: subs criadas até `at` que não foram canceladas até essa data,
 * ou cuja status no momento não era 'canceled' (aproximação por created_at/canceled_at).
 */
function activeMrrAt(subs: any[], at: Date) {
  return subs.reduce((sum, s) => {
    const created = new Date(s.created_at);
    if (created > at) return sum;
    if (s.canceled_at && new Date(s.canceled_at) <= at) return sum;
    if (s.status === 'canceled' && !s.canceled_at) return sum;
    return sum + monthlyValueOf(s);
  }, 0);
}

function activeCompanyCountAt(subs: any[], at: Date) {
  const ids = new Set<string>();
  subs.forEach(s => {
    const created = new Date(s.created_at);
    if (created > at) return;
    if (s.canceled_at && new Date(s.canceled_at) <= at) return;
    if (s.status === 'canceled' && !s.canceled_at) return;
    ids.add(s.company_id);
  });
  return ids.size;
}

function granularity(from: Date, to: Date): 'day' | 'week' | 'month' {
  const days = differenceInDays(to, from) + 1;
  if (days <= 14) return 'day';
  if (days <= 90) return 'week';
  return 'month';
}

export function useMasterDashboardData(
  period: MasterPeriod,
  custom?: { from: Date; to: Date },
  atRiskConfig?: AtRiskConfig,
  upsellConfig?: UpsellConfig,
) {
  const cfg = atRiskConfig || loadAtRiskConfig();
  const upCfg = upsellConfig || loadUpsellConfig();
  const range = getRangeFromPeriod(period, custom);
  const prevRange = getPrevRange(range.from, range.to);

  return useQuery({
    queryKey: [
      'master-dashboard-data', period,
      range.from.toISOString(), range.to.toISOString(),
      JSON.stringify({ w: cfg.weights, t: cfg.thresholds, e: cfg.enabled }),
      JSON.stringify({ uw: upCfg.weights, ut: upCfg.thresholds, ue: upCfg.enabled }),
    ],
    staleTime: 1000 * 60 * 2,
    queryFn: async (): Promise<MasterDashboardData> => {
      const [companiesRes, subsRes, plansRes, instancesRes, stagesRes] = await Promise.all([
        supabase.from('companies').select('id, name, logo_url, plan_status, created_at').limit(5000),
        (supabase as any).from('subscriptions').select('id, company_id, plan_id, plan_name, monthly_price, billing_cycle, status, started_at, canceled_at, created_at').limit(5000),
        (supabase as any).from('subscription_plans').select('id, name, monthly_price, yearly_price, max_leads, max_users, max_whatsapp_instances, display_order'),
        supabase.from('whatsapp_instances').select('id, company_id, status').limit(10000),
        supabase.from('pipeline_stages').select('id, pipeline_id, position').limit(5000),
      ]);
      if (companiesRes.error) throw companiesRes.error;
      if (subsRes.error) throw subsRes.error;

      const companies = companiesRes.data || [];
      const subs = (subsRes.data || []) as any[];
      const plans = (plansRes.data || []) as any[];
      const planById = new Map(plans.map(p => [p.id, p]));
      const instances = (instancesRes.data || []) as any[];
      const stages = (stagesRes.data || []) as any[];
      const { fromIso, toIso } = appRangeToIso(range);
      const { fromIso: prevFromIso, toIso: prevToIso } = appRangeToIso(prevRange);

      // Leads no período + anterior + por empresa (período + anterior)
      const [leadsPeriodRes, leadsPrevRes] = await Promise.all([
        supabase.from('leads').select('id, company_id, created_at, pipeline_id, stage_id, status')
          .gte('created_at', fromIso).lte('created_at', toIso).limit(50000),
        supabase.from('leads').select('id, company_id, created_at')
          .gte('created_at', prevFromIso).lte('created_at', prevToIso).limit(50000),
      ]);
      const leadsPeriod = leadsPeriodRes.data || [];
      const leadsPrev = leadsPrevRes.data || [];

      // Mensagens
      const [msgPeriodRes, msgPrevRes] = await Promise.all([
        supabase.from('chat_messages').select('id', { count: 'exact', head: true })
          .gte('created_at', fromIso).lte('created_at', toIso),
        supabase.from('chat_messages').select('id', { count: 'exact', head: true })
          .gte('created_at', prevFromIso).lte('created_at', prevToIso),
      ]);

      // KPIs
      const mrr = activeMrrAt(subs, range.to);
      const prevMrr = activeMrrAt(subs, prevRange.to);
      const arr = mrr * 12;
      const prevArr = prevMrr * 12;

      const activeAtStart = activeCompanyCountAt(subs, range.from);
      const canceledInPeriod = subs.filter(s =>
        s.canceled_at &&
        new Date(s.canceled_at) >= range.from &&
        new Date(s.canceled_at) <= range.to
      );
      const churnRate = activeAtStart > 0 ? (new Set(canceledInPeriod.map(s => s.company_id)).size / activeAtStart) * 100 : 0;

      const activeAtPrevStart = activeCompanyCountAt(subs, prevRange.from);
      const canceledInPrev = subs.filter(s =>
        s.canceled_at && new Date(s.canceled_at) >= prevRange.from && new Date(s.canceled_at) <= prevRange.to
      );
      const prevChurnRate = activeAtPrevStart > 0 ? (new Set(canceledInPrev.map(s => s.company_id)).size / activeAtPrevStart) * 100 : 0;

      // NRR: MRR atual / MRR de 12 meses atrás (das mesmas empresas que existiam então)
      const yearAgo = subMonths(range.to, 12);
      const mrrYearAgo = activeMrrAt(subs, yearAgo);
      const nrr = mrrYearAgo > 0 ? (mrr / mrrYearAgo) * 100 : 100;

      const totalCompanies = companies.length;
      const newCompanies = companies.filter(c => {
        const d = new Date(c.created_at);
        return d >= range.from && d <= range.to;
      }).length;
      const prevNewCompanies = companies.filter(c => {
        const d = new Date(c.created_at);
        return d >= prevRange.from && d <= prevRange.to;
      }).length;

      const activeCompanies = companies.filter(c => c.plan_status === 'active').length;
      const trialCompanies = companies.filter(c => c.plan_status === 'trial').length;
      const suspendedCompanies = companies.filter(c => c.plan_status === 'suspended').length;
      const canceledCompanies = companies.filter(c => c.plan_status === 'cancelled').length;

      const activeCompaniesCount = activeCompanyCountAt(subs, range.to);
      const avgTicket = activeCompaniesCount > 0 ? arr / activeCompaniesCount : 0;
      const prevActiveCompaniesCount = activeCompanyCountAt(subs, prevRange.to);
      const prevAvgTicket = prevActiveCompaniesCount > 0 ? prevArr / prevActiveCompaniesCount : 0;

      // Utilização: % empresas com ao menos 1 lead OU 1 mensagem no período
      const activeCompanyIds = new Set(leadsPeriod.map((l: any) => l.company_id));
      const utilizationRate = totalCompanies > 0 ? (activeCompanyIds.size / totalCompanies) * 100 : 0;

      const kpis: MasterDashboardKpis = {
        mrr, prevMrr, arr, prevArr,
        churnRate, prevChurnRate,
        retentionRate: 100 - churnRate,
        nrr,
        totalCompanies, newCompanies, prevNewCompanies,
        activeCompanies, trialCompanies, suspendedCompanies, canceledCompanies,
        totalLeads: leadsPeriod.length,
        prevTotalLeads: leadsPrev.length,
        avgTicket, prevAvgTicket,
        messagesPeriod: msgPeriodRes.count || 0,
        prevMessagesPeriod: msgPrevRes.count || 0,
        utilizationRate,
      };

      // Séries
      const gran = granularity(range.from, range.to);
      let buckets: Date[] = [];
      let labelFmt: (d: Date) => string;
      if (gran === 'day') {
        buckets = eachDayOfInterval({ start: range.from, end: range.to });
        labelFmt = (d) => format(d, 'dd/MM', { locale: ptBR });
      } else if (gran === 'week') {
        buckets = eachWeekOfInterval({ start: range.from, end: range.to }, { weekStartsOn: 1 });
        labelFmt = (d) => format(d, "'Sem' dd/MM", { locale: ptBR });
      } else {
        buckets = eachMonthOfInterval({ start: range.from, end: range.to });
        labelFmt = (d) => {
          const s = format(d, 'MMM/yy', { locale: ptBR });
          return s.charAt(0).toUpperCase() + s.slice(1);
        };
      }

      const mrrSeries: MrrPoint[] = buckets.map(b => {
        const at = endOfAppDay(b);
        return { label: labelFmt(b), mrr: activeMrrAt(subs, at) };
      });

      let acc = 0;
      const companyGrowth: CompanyGrowthPoint[] = buckets.map((b, i) => {
        const next = i < buckets.length - 1 ? buckets[i + 1] : range.to;
        const novas = companies.filter(c => {
          const d = new Date(c.created_at);
          return d >= b && d < next;
        }).length;
        acc = (i === 0 ? companies.filter(c => new Date(c.created_at) <= b).length : acc) + novas;
        return { label: labelFmt(b), novas, acumulado: acc };
      });

      // Distribuição por plano (ativos)
      const activeSubs = subs.filter(s => {
        if (s.canceled_at && new Date(s.canceled_at) <= range.to) return false;
        return s.status === 'active' || s.status === 'trialing' || s.status === 'past_due';
      });
      const planMap = new Map<string, { companies: Set<string>; mrr: number }>();
      activeSubs.forEach(s => {
        const planName = s.plan_name || planById.get(s.plan_id)?.name || 'Sem plano';
        if (!planMap.has(planName)) planMap.set(planName, { companies: new Set(), mrr: 0 });
        const e = planMap.get(planName)!;
        e.companies.add(s.company_id);
        e.mrr += monthlyValueOf(s);
      });
      const totalMrr = Array.from(planMap.values()).reduce((s, p) => s + p.mrr, 0) || 1;
      const planDistribution: PlanSlice[] = Array.from(planMap.entries())
        .map(([plan, v]) => ({ plan, companies: v.companies.size, mrr: v.mrr, pct: (v.mrr / totalMrr) * 100 }))
        .sort((a, b) => b.mrr - a.mrr);

      // Top empresas
      const leadsByCompanyPeriod = new Map<string, number>();
      leadsPeriod.forEach((l: any) => leadsByCompanyPeriod.set(l.company_id, (leadsByCompanyPeriod.get(l.company_id) || 0) + 1));
      const leadsByCompanyPrev = new Map<string, number>();
      leadsPrev.forEach((l: any) => leadsByCompanyPrev.set(l.company_id, (leadsByCompanyPrev.get(l.company_id) || 0) + 1));
      const subsByCompany = new Map<string, any[]>();
      subs.forEach(s => {
        if (s.canceled_at && new Date(s.canceled_at) <= range.to) return;
        if (s.status === 'canceled') return;
        if (!subsByCompany.has(s.company_id)) subsByCompany.set(s.company_id, []);
        subsByCompany.get(s.company_id)!.push(s);
      });
      const topCompanies: TopCompanyRow[] = companies.map(c => {
        const cSubs = subsByCompany.get(c.id) || [];
        const cMrr = cSubs.reduce((s, x) => s + monthlyValueOf(x), 0);
        return {
          id: c.id, name: c.name, logo_url: c.logo_url,
          leadsPeriod: leadsByCompanyPeriod.get(c.id) || 0,
          leadsPrev: leadsByCompanyPrev.get(c.id) || 0,
          mrr: cMrr, arr: cMrr * 12,
          created_at: c.created_at,
          plan_status: c.plan_status,
        };
      }).sort((a, b) => (b.mrr - a.mrr) || (b.leadsPeriod - a.leadsPeriod)).slice(0, 10);

      // At-Risk: scoring multifator configurável
      // Indexa leads por empresa para calcular dias-desde-último-lead
      const leadsByCompanyAll = new Map<string, { created_at: string }[]>();
      leadsPeriod.forEach((l: any) => {
        if (!leadsByCompanyAll.has(l.company_id)) leadsByCompanyAll.set(l.company_id, []);
        leadsByCompanyAll.get(l.company_id)!.push({ created_at: l.created_at });
      });
      // Cancelamentos recentes (30d) por empresa
      const recentCancelMs = subDays(new Date(), 30).getTime();
      const recentCancelByCompany = new Set<string>();
      subs.forEach(s => {
        if (s.canceled_at && new Date(s.canceled_at).getTime() >= recentCancelMs) {
          recentCancelByCompany.add(s.company_id);
        }
      });
      // Média de mensagens por empresa ativa (aproximação simples)
      const platformAvgMessages = activeCompaniesCount > 0
        ? (msgPeriodRes.count || 0) / activeCompaniesCount
        : 0;
      // MRR anterior por empresa (snapshot em prevRange.to)
      const prevMrrByCompany = new Map<string, number>();
      subs.forEach(s => {
        const created = new Date(s.created_at);
        if (created > prevRange.to) return;
        if (s.canceled_at && new Date(s.canceled_at) <= prevRange.to) return;
        if (s.status === 'canceled' && !s.canceled_at) return;
        prevMrrByCompany.set(s.company_id, (prevMrrByCompany.get(s.company_id) || 0) + monthlyValueOf(s));
      });

      const atRisk: AtRiskRow[] = [];
      companies.forEach(c => {
        // Pula trial puro sem histórico (não há sinal suficiente)
        if (c.plan_status === 'trial') return;
        const cSubs = subsByCompany.get(c.id) || [];
        const cMrr = cSubs.reduce((s, x) => s + monthlyValueOf(x), 0);
        const result = scoreCompany({
          daysSinceLastLead: daysSinceLastLead(leadsByCompanyAll.get(c.id) || []),
          leadsPeriod: leadsByCompanyPeriod.get(c.id) || 0,
          leadsPrev: leadsByCompanyPrev.get(c.id) || 0,
          mrr: cMrr,
          prevMrr: prevMrrByCompany.get(c.id) || 0,
          planStatus: c.plan_status,
          hasRecentCancellation: recentCancelByCompany.has(c.id),
          messagesPeriod: 0, // sem breakdown por empresa hoje (estimativa neutra)
          platformAvgMessages,
        }, cfg);

        if (result.severity === 'low') return;
        atRisk.push({
          id: c.id, name: c.name,
          reason: result.topReason,
          severity: result.severity,
          score: result.score,
          factors: result.factors,
          mrr: cMrr,
          leadsPeriod: leadsByCompanyPeriod.get(c.id) || 0,
          leadsPrev: leadsByCompanyPrev.get(c.id) || 0,
          daysSinceLastLead: daysSinceLastLead(leadsByCompanyAll.get(c.id) || []),
          planStatus: c.plan_status,
        });
      });
      atRisk.sort((a, b) => b.score - a.score);

      // ===== Upsell: scoring multifator com sinais reais =====
      // Mapa: pipeline_id -> Set de stage_ids "avançados" (top 30% por position)
      const stagesByPipeline = new Map<string, any[]>();
      stages.forEach(s => {
        if (!stagesByPipeline.has(s.pipeline_id)) stagesByPipeline.set(s.pipeline_id, []);
        stagesByPipeline.get(s.pipeline_id)!.push(s);
      });
      const advancedStageIds = new Set<string>();
      stagesByPipeline.forEach(arr => {
        const sorted = arr.sort((a, b) => a.position - b.position);
        const cut = Math.max(1, Math.ceil(sorted.length * 0.3));
        sorted.slice(-cut).forEach(s => advancedStageIds.add(s.id));
      });

      // Hot leads (em estágios avançados) por empresa
      const hotLeadsByCompany = new Map<string, number>();
      leadsPeriod.forEach((l: any) => {
        if (l.stage_id && advancedStageIds.has(l.stage_id)) {
          hotLeadsByCompany.set(l.company_id, (hotLeadsByCompany.get(l.company_id) || 0) + 1);
        }
      });

      // Instâncias WhatsApp ativas por empresa
      const wppInstancesByCompany = new Map<string, number>();
      instances.forEach(i => {
        if (i.status === 'connected' || i.status === 'open' || i.status === 'connecting') {
          wppInstancesByCompany.set(i.company_id, (wppInstancesByCompany.get(i.company_id) || 0) + 1);
        }
      });

      // Plano-alvo: próximo plano acima por display_order/preço
      const plansSorted = [...plans].sort((a, b) => {
        const ao = a.display_order ?? 0, bo = b.display_order ?? 0;
        if (ao !== bo) return ao - bo;
        return (Number(a.monthly_price) || 0) - (Number(b.monthly_price) || 0);
      });
      const findTargetPlan = (currentPlanId: string | null): any | null => {
        if (!currentPlanId) return plansSorted[0] || null;
        const idx = plansSorted.findIndex(p => p.id === currentPlanId);
        if (idx < 0 || idx >= plansSorted.length - 1) return null;
        return plansSorted[idx + 1];
      };

      const upsell: UpsellRow[] = [];
      companies.forEach(c => {
        if (c.plan_status !== 'active' && c.plan_status !== 'trial') return;
        const cSubs = subsByCompany.get(c.id) || [];
        const cMrr = cSubs.reduce((s, x) => s + monthlyValueOf(x), 0);
        const currentSub = cSubs[0];
        const currentPlan = currentSub?.plan_id ? planById.get(currentSub.plan_id) : null;
        const currentPlanName = currentSub?.plan_name || currentPlan?.name || 'Sem plano';
        const targetPlan = findTargetPlan(currentSub?.plan_id || null);
        const targetMrr = targetPlan ? Number(targetPlan.monthly_price) || 0 : null;

        const result = scoreUpsell({
          leadsPeriod: leadsByCompanyPeriod.get(c.id) || 0,
          leadsPrev: leadsByCompanyPrev.get(c.id) || 0,
          pipelineHotLeads: hotLeadsByCompany.get(c.id) || 0,
          messagesPeriod: 0, // sem breakdown por empresa hoje
          platformAvgMessages,
          currentPlanName,
          currentMrr: cMrr,
          currentMaxLeads: currentPlan?.max_leads ?? null,
          currentMaxWhatsapp: currentPlan?.max_whatsapp_instances ?? null,
          whatsappInstancesActive: wppInstancesByCompany.get(c.id) || 0,
          targetPlanName: targetPlan?.name ?? null,
          targetMrr,
        }, upCfg);

        if (result.category === 'cold') return;

        const potential = Math.max(0, (targetMrr ?? cMrr * 1.5) - cMrr);
        upsell.push({
          id: c.id, name: c.name,
          currentPlanName,
          targetPlanName: targetPlan?.name ?? '—',
          leads: leadsByCompanyPeriod.get(c.id) || 0,
          leadsPrev: leadsByCompanyPrev.get(c.id) || 0,
          currentMrr: cMrr,
          targetMrr: targetMrr ?? cMrr,
          potential,
          potentialAnnual: potential * 12,
          score: result.score,
          category: result.category,
          factors: result.factors,
          topReason: result.topReason,
          whatsappUsage: {
            used: wppInstancesByCompany.get(c.id) || 0,
            max: currentPlan?.max_whatsapp_instances ?? null,
          },
          leadsUsage: {
            used: leadsByCompanyPeriod.get(c.id) || 0,
            max: currentPlan?.max_leads ?? null,
          },
        });
      });
      upsell.sort((a, b) => b.score - a.score || b.potential - a.potential);

      // Churn por mês (últimos 6)
      const churnByMonth: { month: string; rate: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfAppMonth(subMonths(getAppToday(), i));
        const monthEnd = endOfMonth(monthStart);
        const activeStart = activeCompanyCountAt(subs, monthStart);
        const cancels = subs.filter(s => s.canceled_at && isWithinInterval(new Date(s.canceled_at), { start: monthStart, end: monthEnd }));
        const rate = activeStart > 0 ? (new Set(cancels.map(s => s.company_id)).size / activeStart) * 100 : 0;
        const lbl = format(monthStart, 'MMM', { locale: ptBR });
        churnByMonth.push({ month: lbl.charAt(0).toUpperCase() + lbl.slice(1), rate });
      }

      // Validação de Churn/NRR (canceled_at + plan_id + checagens cruzadas)
      const validation = validateChurnInputs({ subs, range, prevRange });
      logChurnReport(validation, `Master ${period}`);

      return {
        kpis, mrrSeries, companyGrowth, planDistribution, topCompanies,
        atRisk: atRisk.slice(0, 5), upsell, churnByMonth,
        range, prevRange, validation,
      };
    },
  });
}
