/**
 * Sistema de scoring At-Risk configurável.
 *
 * Cada fator produz uma contribuição entre 0 e 1 (intensidade), que é multiplicada
 * pelo peso configurado. O score final é a soma das contribuições ponderadas,
 * normalizada para 0–100 dividindo pela soma dos pesos ativos.
 *
 * Severidades:
 *  - score >= highThreshold     -> 'high'
 *  - score >= mediumThreshold   -> 'medium'
 *  - score < mediumThreshold    -> 'low' (não exibido)
 */

import { differenceInDays, subDays } from 'date-fns';

export interface AtRiskWeights {
  inactivity: number;       // dias sem leads recentes
  leadsDrop: number;        // queda de leads vs período anterior
  revenueDrop: number;      // queda de MRR (cancelamento parcial / downgrade)
  paymentIssue: number;     // status past_due / suspended
  churnSignal: number;      // assinatura cancelada recentemente
  lowEngagement: number;    // poucas mensagens vs média da plataforma
}

export interface AtRiskThresholds {
  inactivityDaysWarn: number;   // dias sem lead -> contribui parcial
  inactivityDaysCrit: number;   // dias sem lead -> contribuição máxima
  leadsDropPctWarn: number;     // % de queda mínima para começar a contar
  leadsDropPctCrit: number;     // % de queda para contribuição máxima
  revenueDropPctWarn: number;
  revenueDropPctCrit: number;
  minLeadsPrevForDrop: number;  // só considerar queda se período anterior tinha N+ leads
  mediumScore: number;          // score mínimo para exibir como medium
  highScore: number;            // score mínimo para classificar como high
}

export interface AtRiskConfig {
  weights: AtRiskWeights;
  thresholds: AtRiskThresholds;
  enabled: Record<keyof AtRiskWeights, boolean>;
}

export const DEFAULT_AT_RISK_CONFIG: AtRiskConfig = {
  weights: {
    inactivity: 30,
    leadsDrop: 25,
    revenueDrop: 20,
    paymentIssue: 35,
    churnSignal: 40,
    lowEngagement: 10,
  },
  thresholds: {
    inactivityDaysWarn: 7,
    inactivityDaysCrit: 21,
    leadsDropPctWarn: 30,
    leadsDropPctCrit: 70,
    revenueDropPctWarn: 10,
    revenueDropPctCrit: 50,
    minLeadsPrevForDrop: 5,
    mediumScore: 35,
    highScore: 65,
  },
  enabled: {
    inactivity: true,
    leadsDrop: true,
    revenueDrop: true,
    paymentIssue: true,
    churnSignal: true,
    lowEngagement: true,
  },
};

export interface AtRiskFactor {
  key: keyof AtRiskWeights;
  label: string;
  intensity: number;          // 0..1
  weight: number;             // peso configurado
  contribution: number;       // intensity * weight (escala bruta)
  description: string;
}

export interface AtRiskScoreResult {
  score: number;              // 0..100
  severity: 'low' | 'medium' | 'high';
  factors: AtRiskFactor[];    // já filtrado para contribuição > 0, ordenado desc
  topReason: string;          // descrição do principal fator
}

export interface CompanyScoreInput {
  daysSinceLastLead: number | null;   // null = nunca teve lead
  leadsPeriod: number;
  leadsPrev: number;
  mrr: number;
  prevMrr: number;
  planStatus: string;                  // active | past_due | suspended | cancelled | trial
  hasRecentCancellation: boolean;      // assinatura cancelada nos últimos 30d
  messagesPeriod: number;
  platformAvgMessages: number;         // média de mensagens por empresa ativa
}

const FACTOR_LABELS: Record<keyof AtRiskWeights, string> = {
  inactivity: 'Inatividade prolongada',
  leadsDrop: 'Queda de leads',
  revenueDrop: 'Queda de receita (MRR)',
  paymentIssue: 'Problema de pagamento',
  churnSignal: 'Sinal de churn',
  lowEngagement: 'Baixo engajamento',
};

function clamp01(n: number) {
  if (!isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** Interpolação linear entre warn (0) e crit (1) */
function ramp(value: number, warn: number, crit: number) {
  if (crit <= warn) return value >= crit ? 1 : 0;
  if (value <= warn) return 0;
  if (value >= crit) return 1;
  return (value - warn) / (crit - warn);
}

export function scoreCompany(input: CompanyScoreInput, cfg: AtRiskConfig = DEFAULT_AT_RISK_CONFIG): AtRiskScoreResult {
  const factors: AtRiskFactor[] = [];
  const { weights, thresholds, enabled } = cfg;

  // 1. Inatividade
  if (enabled.inactivity) {
    const days = input.daysSinceLastLead;
    if (days !== null) {
      const intensity = ramp(days, thresholds.inactivityDaysWarn, thresholds.inactivityDaysCrit);
      if (intensity > 0) {
        factors.push({
          key: 'inactivity', label: FACTOR_LABELS.inactivity, intensity,
          weight: weights.inactivity,
          contribution: intensity * weights.inactivity,
          description: `${days} dia${days === 1 ? '' : 's'} sem novos leads`,
        });
      }
    }
  }

  // 2. Queda de leads
  if (enabled.leadsDrop && input.leadsPrev >= thresholds.minLeadsPrevForDrop) {
    const dropPct = ((input.leadsPrev - input.leadsPeriod) / input.leadsPrev) * 100;
    if (dropPct > 0) {
      const intensity = ramp(dropPct, thresholds.leadsDropPctWarn, thresholds.leadsDropPctCrit);
      if (intensity > 0) {
        factors.push({
          key: 'leadsDrop', label: FACTOR_LABELS.leadsDrop, intensity,
          weight: weights.leadsDrop,
          contribution: intensity * weights.leadsDrop,
          description: `${Math.round(dropPct)}% menos leads vs período anterior`,
        });
      }
    }
  }

  // 3. Queda de receita
  if (enabled.revenueDrop && input.prevMrr > 0) {
    const dropPct = ((input.prevMrr - input.mrr) / input.prevMrr) * 100;
    if (dropPct > 0) {
      const intensity = ramp(dropPct, thresholds.revenueDropPctWarn, thresholds.revenueDropPctCrit);
      if (intensity > 0) {
        factors.push({
          key: 'revenueDrop', label: FACTOR_LABELS.revenueDrop, intensity,
          weight: weights.revenueDrop,
          contribution: intensity * weights.revenueDrop,
          description: `MRR caiu ${Math.round(dropPct)}% (downgrade ou cancelamento parcial)`,
        });
      }
    }
  }

  // 4. Problema de pagamento
  if (enabled.paymentIssue) {
    let intensity = 0;
    let desc = '';
    if (input.planStatus === 'past_due') { intensity = 0.7; desc = 'Pagamento em atraso'; }
    else if (input.planStatus === 'suspended') { intensity = 1; desc = 'Conta suspensa por inadimplência'; }
    if (intensity > 0) {
      factors.push({
        key: 'paymentIssue', label: FACTOR_LABELS.paymentIssue, intensity,
        weight: weights.paymentIssue,
        contribution: intensity * weights.paymentIssue,
        description: desc,
      });
    }
  }

  // 5. Sinal de churn explícito
  if (enabled.churnSignal && input.hasRecentCancellation) {
    factors.push({
      key: 'churnSignal', label: FACTOR_LABELS.churnSignal, intensity: 1,
      weight: weights.churnSignal,
      contribution: weights.churnSignal,
      description: 'Assinatura cancelada nos últimos 30 dias',
    });
  }

  // 6. Baixo engajamento
  if (enabled.lowEngagement && input.platformAvgMessages > 0) {
    const ratio = input.messagesPeriod / input.platformAvgMessages;
    // Quanto MENOR o ratio, MAIOR a contribuição. Ratio < 0.3 => contribuição máxima.
    const intensity = clamp01((0.5 - ratio) / 0.5);
    if (intensity > 0) {
      factors.push({
        key: 'lowEngagement', label: FACTOR_LABELS.lowEngagement, intensity,
        weight: weights.lowEngagement,
        contribution: intensity * weights.lowEngagement,
        description: `Volume de mensagens ${Math.round((1 - ratio) * 100)}% abaixo da média da plataforma`,
      });
    }
  }

  // Normalização: soma das contribuições / soma dos pesos ativos * 100
  const activeWeights = (Object.keys(weights) as (keyof AtRiskWeights)[])
    .filter(k => enabled[k])
    .reduce((s, k) => s + weights[k], 0);

  const rawSum = factors.reduce((s, f) => s + f.contribution, 0);
  const score = activeWeights > 0 ? Math.min(100, Math.round((rawSum / activeWeights) * 100)) : 0;

  let severity: AtRiskScoreResult['severity'] = 'low';
  if (score >= cfg.thresholds.highScore) severity = 'high';
  else if (score >= cfg.thresholds.mediumScore) severity = 'medium';

  factors.sort((a, b) => b.contribution - a.contribution);

  return {
    score,
    severity,
    factors,
    topReason: factors[0]?.description || 'Sem fatores de risco relevantes',
  };
}

/** Helper para calcular dias desde o último lead a partir de uma lista. */
export function daysSinceLastLead(leads: { created_at: string }[], referenceDate: Date = new Date()): number | null {
  if (!leads.length) return null;
  const latest = leads.reduce((max, l) => {
    const d = new Date(l.created_at);
    return d > max ? d : max;
  }, new Date(0));
  return Math.max(0, differenceInDays(referenceDate, latest));
}

/* ---------- Persistência da config ---------- */

const STORAGE_KEY = 'master.atRiskConfig.v1';

export function loadAtRiskConfig(): AtRiskConfig {
  if (typeof window === 'undefined') return DEFAULT_AT_RISK_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AT_RISK_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      weights: { ...DEFAULT_AT_RISK_CONFIG.weights, ...(parsed.weights || {}) },
      thresholds: { ...DEFAULT_AT_RISK_CONFIG.thresholds, ...(parsed.thresholds || {}) },
      enabled: { ...DEFAULT_AT_RISK_CONFIG.enabled, ...(parsed.enabled || {}) },
    };
  } catch {
    return DEFAULT_AT_RISK_CONFIG;
  }
}

export function saveAtRiskConfig(cfg: AtRiskConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function resetAtRiskConfig() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// Re-export para conveniência
export { subDays };
