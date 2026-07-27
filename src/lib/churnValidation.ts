/**
 * Validação de consistência para cálculos de Churn e NRR.
 *
 * Detecta divergências comuns entre os campos `canceled_at`, `status` e `plan_id`
 * das assinaturas, e roda checagens cruzadas com os totais usados nos KPIs.
 *
 * Uso típico (dev):
 *   const report = validateChurnInputs({ subs, range, prevRange });
 *   logChurnReport(report);
 */

export interface SubLike {
  id: string;
  company_id: string;
  plan_id?: string | null;
  plan_name?: string | null;
  monthly_price: number | string;
  billing_cycle: 'monthly' | 'yearly' | string;
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | string;
  started_at?: string | null;
  canceled_at?: string | null;
  created_at: string;
}

export type Severity = 'info' | 'warn' | 'error';

export interface ChurnIssue {
  severity: Severity;
  code:
    | 'canceled_without_canceled_at'
    | 'canceled_at_without_status'
    | 'canceled_at_in_future'
    | 'canceled_at_before_created'
    | 'missing_plan_id'
    | 'invalid_monthly_price'
    | 'invalid_billing_cycle'
    | 'duplicate_active_subscription'
    | 'churn_negative'
    | 'churn_above_100'
    | 'nrr_without_baseline'
    | 'nrr_negative'
    | 'mrr_drop_without_cancellations'
    | 'cancellations_without_mrr_drop';
  message: string;
  subscription_id?: string;
  company_id?: string;
}

export interface ChurnValidationReport {
  ok: boolean;
  totalSubs: number;
  consideredSubs: number;
  cancellationsInPeriod: number;
  cancellationsInPrev: number;
  issues: ChurnIssue[];
  computed: {
    activeAtRangeStart: number;
    activeAtRangeEnd: number;
    activeAtPrevStart: number;
    mrrAtRangeEnd: number;
    mrrYearAgo: number;
    churnRate: number;
    prevChurnRate: number;
    nrr: number | null;
  };
}

function monthlyValueOf(s: SubLike) {
  const v = Number(s.monthly_price) || 0;
  return s.billing_cycle === 'yearly' ? v / 12 : v;
}

function isActiveAt(s: SubLike, at: Date) {
  const created = new Date(s.created_at);
  if (Number.isNaN(created.getTime())) return false;
  if (created > at) return false;
  if (s.canceled_at) {
    const cd = new Date(s.canceled_at);
    if (!Number.isNaN(cd.getTime()) && cd <= at) return false;
  } else if (s.status === 'canceled') {
    return false;
  }
  return true;
}

interface ValidateInput {
  subs: SubLike[];
  range: { from: Date; to: Date };
  prevRange: { from: Date; to: Date };
  /** Tolerância para detectar divergência entre cancelamentos e queda de MRR (em R$). Default 0,01. */
  mrrTolerance?: number;
}

export function validateChurnInputs(input: ValidateInput): ChurnValidationReport {
  const { subs, range, prevRange } = input;
  const tol = input.mrrTolerance ?? 0.01;
  const issues: ChurnIssue[] = [];
  const now = new Date();

  // ---------------- Per-row consistency ----------------
  const seenActivePerCompany = new Map<string, number>();
  for (const s of subs) {
    const created = new Date(s.created_at);

    if (s.status === 'canceled' && !s.canceled_at) {
      issues.push({
        severity: 'warn', code: 'canceled_without_canceled_at',
        message: `Subscription ${s.id} tem status='canceled' mas canceled_at é nulo. Será tratada como cancelada na data de criação.`,
        subscription_id: s.id, company_id: s.company_id,
      });
    }
    if (s.canceled_at && s.status !== 'canceled') {
      issues.push({
        severity: 'warn', code: 'canceled_at_without_status',
        message: `Subscription ${s.id} tem canceled_at preenchido mas status='${s.status}'.`,
        subscription_id: s.id, company_id: s.company_id,
      });
    }
    if (s.canceled_at) {
      const cd = new Date(s.canceled_at);
      if (!Number.isNaN(cd.getTime())) {
        if (cd > now) {
          issues.push({
            severity: 'info', code: 'canceled_at_in_future',
            message: `Subscription ${s.id} possui canceled_at no futuro (${cd.toISOString()}).`,
            subscription_id: s.id, company_id: s.company_id,
          });
        }
        if (!Number.isNaN(created.getTime()) && cd < created) {
          issues.push({
            severity: 'error', code: 'canceled_at_before_created',
            message: `Subscription ${s.id}: canceled_at (${cd.toISOString()}) é anterior a created_at (${created.toISOString()}).`,
            subscription_id: s.id, company_id: s.company_id,
          });
        }
      }
    }
    if (s.status !== 'canceled' && !s.plan_id) {
      issues.push({
        severity: 'warn', code: 'missing_plan_id',
        message: `Subscription ${s.id} ativa/trialing sem plan_id (plan_name='${s.plan_name ?? '—'}'). Distribuição por plano pode ficar imprecisa.`,
        subscription_id: s.id, company_id: s.company_id,
      });
    }
    const mp = Number(s.monthly_price);
    if (!Number.isFinite(mp) || mp < 0) {
      issues.push({
        severity: 'error', code: 'invalid_monthly_price',
        message: `Subscription ${s.id} tem monthly_price inválido: ${s.monthly_price}.`,
        subscription_id: s.id, company_id: s.company_id,
      });
    }
    if (s.billing_cycle !== 'monthly' && s.billing_cycle !== 'yearly') {
      issues.push({
        severity: 'warn', code: 'invalid_billing_cycle',
        message: `Subscription ${s.id} tem billing_cycle desconhecido: '${s.billing_cycle}'.`,
        subscription_id: s.id, company_id: s.company_id,
      });
    }
    if (isActiveAt(s, range.to)) {
      seenActivePerCompany.set(s.company_id, (seenActivePerCompany.get(s.company_id) ?? 0) + 1);
    }
  }

  // Empresas com mais de uma subscription ativa simultaneamente (deveria ser 1)
  for (const [companyId, count] of seenActivePerCompany) {
    if (count > 1) {
      issues.push({
        severity: 'warn', code: 'duplicate_active_subscription',
        message: `Empresa ${companyId} tem ${count} assinaturas consideradas ativas simultaneamente em ${range.to.toISOString()}.`,
        company_id: companyId,
      });
    }
  }

  // ---------------- Cross-checks com KPIs ----------------
  const activeAtRangeStart = countActiveCompaniesAt(subs, range.from);
  const activeAtRangeEnd = countActiveCompaniesAt(subs, range.to);
  const activeAtPrevStart = countActiveCompaniesAt(subs, prevRange.from);

  const mrrAtRangeEnd = subs.reduce((sum, s) => isActiveAt(s, range.to) ? sum + monthlyValueOf(s) : sum, 0);
  const mrrAtRangeStart = subs.reduce((sum, s) => isActiveAt(s, range.from) ? sum + monthlyValueOf(s) : sum, 0);
  const yearAgo = new Date(range.to);
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const mrrYearAgo = subs.reduce((sum, s) => isActiveAt(s, yearAgo) ? sum + monthlyValueOf(s) : sum, 0);

  const cancellationsInPeriod = subs.filter(s =>
    s.canceled_at &&
    new Date(s.canceled_at) >= range.from &&
    new Date(s.canceled_at) <= range.to,
  );
  const cancellationsInPrev = subs.filter(s =>
    s.canceled_at &&
    new Date(s.canceled_at) >= prevRange.from &&
    new Date(s.canceled_at) <= prevRange.to,
  );
  const uniqCancelCompanies = new Set(cancellationsInPeriod.map(s => s.company_id)).size;
  const uniqCancelCompaniesPrev = new Set(cancellationsInPrev.map(s => s.company_id)).size;

  const churnRate = activeAtRangeStart > 0 ? (uniqCancelCompanies / activeAtRangeStart) * 100 : 0;
  const prevChurnRate = activeAtPrevStart > 0 ? (uniqCancelCompaniesPrev / activeAtPrevStart) * 100 : 0;
  const nrr = mrrYearAgo > 0 ? (mrrAtRangeEnd / mrrYearAgo) * 100 : null;

  if (churnRate < 0) {
    issues.push({ severity: 'error', code: 'churn_negative', message: `Churn negativo (${churnRate.toFixed(2)}%) — base ativa no início do período pode estar inconsistente.` });
  }
  if (churnRate > 100) {
    issues.push({ severity: 'error', code: 'churn_above_100', message: `Churn acima de 100% (${churnRate.toFixed(2)}%) — provavelmente há cancellations de empresas que não estavam contadas como ativas no início.` });
  }
  if (nrr === null) {
    issues.push({ severity: 'info', code: 'nrr_without_baseline', message: `Sem base de MRR há 12 meses (mrrYearAgo=0). NRR não calculado.` });
  } else if (nrr < 0) {
    issues.push({ severity: 'error', code: 'nrr_negative', message: `NRR negativo (${nrr.toFixed(1)}%) — verifique sinais e datas das assinaturas.` });
  }

  // Cruzamento: queda de MRR sem cancelamentos (ou vice-versa) no período
  const mrrLost = cancellationsInPeriod.reduce((s, sub) => s + monthlyValueOf(sub), 0);
  const mrrDrop = mrrAtRangeStart - mrrAtRangeEnd; // positivo se caiu
  if (mrrDrop > tol && uniqCancelCompanies === 0) {
    issues.push({
      severity: 'warn', code: 'mrr_drop_without_cancellations',
      message: `MRR caiu R$${mrrDrop.toFixed(2)} no período sem nenhum canceled_at registrado. Possível downgrade não rastreado ou status='canceled' sem data.`,
    });
  }
  if (uniqCancelCompanies > 0 && mrrLost > tol && mrrDrop + tol < mrrLost / 2) {
    issues.push({
      severity: 'info', code: 'cancellations_without_mrr_drop',
      message: `${uniqCancelCompanies} cancelamento(s) representando R$${mrrLost.toFixed(2)} de MRR, mas a queda observada foi R$${mrrDrop.toFixed(2)} (provável compensação por novas assinaturas).`,
    });
  }

  return {
    ok: issues.every(i => i.severity !== 'error'),
    totalSubs: subs.length,
    consideredSubs: subs.filter(s => isActiveAt(s, range.to) || (s.canceled_at && new Date(s.canceled_at) >= range.from)).length,
    cancellationsInPeriod: cancellationsInPeriod.length,
    cancellationsInPrev: cancellationsInPrev.length,
    issues,
    computed: {
      activeAtRangeStart, activeAtRangeEnd, activeAtPrevStart,
      mrrAtRangeEnd, mrrYearAgo,
      churnRate, prevChurnRate, nrr,
    },
  };
}

function countActiveCompaniesAt(subs: SubLike[], at: Date) {
  const ids = new Set<string>();
  for (const s of subs) if (isActiveAt(s, at)) ids.add(s.company_id);
  return ids.size;
}

/** Loga o relatório no console agrupado por severidade. Silencioso em produção. */
export function logChurnReport(report: ChurnValidationReport, label = 'Churn/NRR') {
  if (typeof window === 'undefined') return;
  if (import.meta.env.MODE === 'production') return;

  const errors = report.issues.filter(i => i.severity === 'error');
  const warns = report.issues.filter(i => i.severity === 'warn');
  const infos = report.issues.filter(i => i.severity === 'info');

  // eslint-disable-next-line no-console
  console.groupCollapsed(
    `[${label}] ${report.ok ? '✓' : '✗'} ${report.totalSubs} subs · ` +
    `${report.cancellationsInPeriod} cancel. período · ` +
    `churn=${report.computed.churnRate.toFixed(2)}% · ` +
    `nrr=${report.computed.nrr === null ? '—' : report.computed.nrr.toFixed(1) + '%'} · ` +
    `${errors.length}E/${warns.length}W/${infos.length}I`,
  );
  // eslint-disable-next-line no-console
  console.table(report.computed);
  if (errors.length) console.error('Errors:', errors);
  if (warns.length) console.warn('Warnings:', warns);
  if (infos.length) console.info('Info:', infos);
  // eslint-disable-next-line no-console
  console.groupEnd();
}
