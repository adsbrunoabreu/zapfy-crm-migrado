// Pure helpers for dashboard metrics. Extracted from useDashboardData
// so they can be unit-tested without mocking Supabase.
import { format, startOfHour, startOfDay, addHours, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type StageType = 'open' | 'won' | 'lost' | 'unassigned';
export type BucketGranularity = 'hour' | 'day';

export interface LeadRowLite {
  id: string;
  status: string;
  value: number | null;
  created_at: string;
  responded_at: string | null;
  assigned_to: string | null;
  stage_id: string | null;
  pipeline_id: string | null;
  closed_at?: string | null;
  closed_by?: string | null;
  loss_reason_id?: string | null;
  loss_reason_text?: string | null;
}

export interface PipelineStageLite {
  id: string;
  stage_type: StageType;
}

export interface DateRangeLite {
  startDate: Date;
  endDate: Date;
  period: 'today' | 'yesterday' | '7d' | '15d' | '30d' | '60d' | '90d' | 'mtd' | 'ytd' | 'custom';
}

export interface EvolutionBucketAcc {
  label: string;
  key: string;
  count: number;
  messages: number;
  won: number;
  closedWon: number;
  closedLost: number;
  reopened: number;
}

export function bucketKey(d: Date, gran: BucketGranularity): string {
  return gran === 'hour' ? format(d, 'yyyy-MM-dd-HH') : format(d, 'yyyy-MM-dd');
}

export function buildEmptyBuckets(range: DateRangeLite): {
  gran: BucketGranularity;
  buckets: EvolutionBucketAcc[];
} {
  const { startDate, endDate, period } = range;
  const buckets: EvolutionBucketAcc[] = [];
  const gran: BucketGranularity =
    period === 'today' || period === 'yesterday' ? 'hour' : 'day';

  if (gran === 'hour') {
    let cursor = startOfHour(startDate);
    while (cursor <= endDate) {
      buckets.push({
        label: format(cursor, 'HH') + 'h',
        key: bucketKey(cursor, 'hour'),
        count: 0,
        messages: 0,
        won: 0,
        closedWon: 0,
        closedLost: 0,
        reopened: 0,
      });
      cursor = addHours(cursor, 1);
    }
  } else {
    let cursor = startOfDay(startDate);
    const labelFmt = period === '7d' ? 'EEE' : 'dd/MM';
    while (cursor <= endDate) {
      buckets.push({
        label:
          period === '7d'
            ? format(cursor, labelFmt, { locale: ptBR })
            : format(cursor, labelFmt),
        key: bucketKey(cursor, 'day'),
        count: 0,
        messages: 0,
        won: 0,
        closedWon: 0,
        closedLost: 0,
        reopened: 0,
      });
      cursor = addDays(cursor, 1);
    }
  }

  return { gran, buckets };
}

/** Distribui eventos de reabertura (lead_activities.lead_reopened) nos buckets. */
export function fillReopenedIntoBuckets(
  range: DateRangeLite,
  buckets: EvolutionBucketAcc[],
  events: { created_at: string }[],
): void {
  const { gran } = buildEmptyBuckets(range);
  const idx = new Map(buckets.map((b) => [b.key, b]));
  events.forEach((e) => {
    const d = new Date(e.created_at);
    if (d < range.startDate || d > range.endDate) return;
    const b = idx.get(bucketKey(d, gran));
    if (b) b.reopened++;
  });
}

/** Determine if a lead counts as "won". Stage_type is source of truth;
 *  fallback to legacy `status='won'` only when company has zero stages. */
export function makeIsWonLead(stages: PipelineStageLite[]) {
  const wonStageIds = new Set(
    stages.filter((s) => s.stage_type === 'won').map((s) => s.id),
  );
  const hasStages = stages.length > 0;
  return (l: Pick<LeadRowLite, 'stage_id' | 'status'>) =>
    Boolean(
      (l.stage_id && wonStageIds.has(l.stage_id)) ||
        (!hasStages && l.status === 'won'),
    );
}

export interface KpiResult {
  total: number;
  revenue: number;
  conversionRate: number;
  avgTicket: number;
  avgResponseHours: number;
  respondedCount: number;
  wonCount: number;
}

export function computeKpis(
  leads: LeadRowLite[],
  isWon: (l: LeadRowLite) => boolean,
): KpiResult {
  const total = leads.length;
  const wonCount = leads.filter(isWon).length;
  const revenue = leads.reduce((s, l) => s + (l.value || 0), 0);
  const conversionRate = total > 0 ? (wonCount / total) * 100 : 0;
  const valued = leads.filter((l) => (l.value || 0) > 0);
  const avgTicket = valued.length > 0 ? revenue / valued.length : 0;
  const responded = leads.filter((l) => l.responded_at);
  const avgResponseHours =
    responded.length > 0
      ? responded.reduce((s, l) => {
          const ms =
            new Date(l.responded_at!).getTime() -
            new Date(l.created_at).getTime();
          return s + Math.max(0, ms) / 3600000;
        }, 0) / responded.length
      : 0;
  return {
    total,
    revenue,
    conversionRate,
    avgTicket,
    avgResponseHours,
    respondedCount: responded.length,
    wonCount,
  };
}

/** Fill in leads/messages/won counts per bucket. Mutates and returns buckets. */
export function fillEvolutionBuckets(
  range: DateRangeLite,
  leads: LeadRowLite[],
  messages: { created_at: string }[],
  isWon: (l: LeadRowLite) => boolean,
): EvolutionBucketAcc[] {
  const { gran, buckets } = buildEmptyBuckets(range);
  const idx = new Map(buckets.map((b) => [b.key, b]));
  leads.forEach((l) => {
    const d = new Date(l.created_at);
    if (d < range.startDate || d > range.endDate) return;
    const b = idx.get(bucketKey(d, gran));
    if (b) {
      b.count++;
      if (isWon(l)) b.won++;
    }
  });
  messages.forEach((m) => {
    const d = new Date(m.created_at);
    const b = idx.get(bucketKey(d, gran));
    if (b) b.messages++;
  });
  return buckets;
}

// ─────────────────────────────────────────────────────────────
// Won/Lost & ciclo (fonte de verdade: stage_type + closed_at)
// ─────────────────────────────────────────────────────────────

export function makeIsLostLead(stages: PipelineStageLite[]) {
  const lostStageIds = new Set(
    stages.filter((s) => s.stage_type === 'lost').map((s) => s.id),
  );
  const hasStages = stages.length > 0;
  return (l: Pick<LeadRowLite, 'stage_id' | 'status'>) =>
    Boolean(
      (l.stage_id && lostStageIds.has(l.stage_id)) ||
        (!hasStages && l.status === 'lost'),
    );
}

export interface ClosingsKpi {
  wonCount: number;
  lostCount: number;
  closedCount: number;
  wonRevenue: number;
  lostRevenue: number;
  winRateClosed: number;
  lossRate: number;
  avgWonTicket: number;
  avgCycleDays: number;
}

/** KPIs de fechamento — considera apenas leads com closed_at no período. */
export function computeClosingsKpis(
  leads: LeadRowLite[],
  isWon: (l: LeadRowLite) => boolean,
  isLost: (l: LeadRowLite) => boolean,
  range: DateRangeLite,
): ClosingsKpi {
  const inRange = leads.filter((l) => {
    if (!l.closed_at) return false;
    const d = new Date(l.closed_at);
    return d >= range.startDate && d <= range.endDate;
  });
  const wonLeads = inRange.filter(isWon);
  const lostLeads = inRange.filter(isLost);
  const wonRevenue = wonLeads.reduce((s, l) => s + (l.value || 0), 0);
  const lostRevenue = lostLeads.reduce((s, l) => s + (l.value || 0), 0);
  const closedCount = wonLeads.length + lostLeads.length;
  const winRateClosed = closedCount > 0 ? (wonLeads.length / closedCount) * 100 : 0;
  const lossRate = closedCount > 0 ? (lostLeads.length / closedCount) * 100 : 0;
  const valuedWon = wonLeads.filter((l) => (l.value || 0) > 0);
  const avgWonTicket = valuedWon.length > 0 ? wonRevenue / valuedWon.length : 0;
  const cycles = wonLeads
    .map((l) => {
      if (!l.closed_at) return null;
      const ms = new Date(l.closed_at).getTime() - new Date(l.created_at).getTime();
      return ms >= 0 ? ms / 86400000 : null;
    })
    .filter((v): v is number => v !== null);
  const avgCycleDays = cycles.length > 0 ? cycles.reduce((s, v) => s + v, 0) / cycles.length : 0;
  return {
    wonCount: wonLeads.length,
    lostCount: lostLeads.length,
    closedCount,
    wonRevenue,
    lostRevenue,
    winRateClosed,
    lossRate,
    avgWonTicket,
    avgCycleDays,
  };
}

/** Distribui won/lost nos buckets pelo eixo de fechamento (closed_at). */
export function fillClosingsIntoBuckets(
  range: DateRangeLite,
  buckets: EvolutionBucketAcc[],
  leads: LeadRowLite[],
  isWon: (l: LeadRowLite) => boolean,
  isLost: (l: LeadRowLite) => boolean,
): void {
  const { gran } = buildEmptyBuckets(range);
  const idx = new Map(buckets.map((b) => [b.key, b]));
  leads.forEach((l) => {
    if (!l.closed_at) return;
    const d = new Date(l.closed_at);
    if (d < range.startDate || d > range.endDate) return;
    const b = idx.get(bucketKey(d, gran));
    if (!b) return;
    if (isWon(l)) b.closedWon++;
    else if (isLost(l)) b.closedLost++;
  });
}

export interface LossReasonAgg {
  reason_id: string | null;
  label: string;
  count: number;
  total_value: number;
  percentage: number;
}

/** Agrega motivos de perda dos leads fechados como lost no período (closed_at). */
export function computeLossReasons(
  leads: LeadRowLite[],
  isLost: (l: LeadRowLite) => boolean,
  range: DateRangeLite,
  reasonLabels: Map<string, string>,
): LossReasonAgg[] {
  const lostInRange = leads.filter((l) => {
    if (!l.closed_at) return false;
    const d = new Date(l.closed_at);
    return d >= range.startDate && d <= range.endDate && isLost(l);
  });
  if (lostInRange.length === 0) return [];
  const acc = new Map<string, { label: string; count: number; total_value: number }>();
  lostInRange.forEach((l) => {
    const key = l.loss_reason_id || `text::${(l.loss_reason_text || '').trim()}` || 'sem-motivo';
    const label =
      (l.loss_reason_id && reasonLabels.get(l.loss_reason_id)) ||
      (l.loss_reason_text || '').trim() ||
      'Sem motivo informado';
    const e = acc.get(key) || { label, count: 0, total_value: 0 };
    e.count++;
    e.total_value += l.value || 0;
    acc.set(key, e);
  });
  const total = lostInRange.length;
  return Array.from(acc.entries())
    .map(([k, v]) => ({
      reason_id: k.startsWith('text::') || k === 'sem-motivo' ? null : k,
      label: v.label,
      count: v.count,
      total_value: v.total_value,
      percentage: total > 0 ? (v.count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);
}
