/**
 * Sistema de scoring de oportunidades de Upsell.
 *
 * Cada sinal contribui com uma intensidade (0..1) ponderada por um peso configurável.
 * O score final é normalizado para 0..100 (soma das contribuições / soma dos pesos ativos * 100).
 *
 * Categorias:
 *  - 'hot'   (>= hotScore)    → forte recomendação de upgrade
 *  - 'warm'  (>= warmScore)   → vale conversar
 *  - 'cold'  (< warmScore)    → não exibido
 */

export interface UpsellWeights {
  leadsSaturation: number;     // % do limite de leads consumido
  leadsGrowth: number;         // crescimento de leads vs período anterior
  whatsappSaturation: number;  // instâncias usadas / max_whatsapp_instances
  pipelineActivity: number;    // leads em estágios avançados (pipeline aquecido)
  highEngagement: number;      // mensagens muito acima da média
  planUnderpriced: number;     // ticket bem abaixo do plano-alvo (gap de receita)
}

export interface UpsellThresholds {
  saturationWarn: number;      // % do limite a partir do qual começa a contar
  saturationCrit: number;      // % do limite com contribuição máxima
  leadsGrowthWarn: number;     // % de aumento mínimo
  leadsGrowthCrit: number;     // % de aumento para contribuição máxima
  engagementMultiplierWarn: number; // ratio mensagens vs média (ex 1.5x)
  engagementMultiplierCrit: number; // ratio para contribuição máxima (ex 3x)
  minLeadsForSignal: number;   // descarta empresas muito pequenas
  warmScore: number;
  hotScore: number;
}

export interface UpsellConfig {
  weights: UpsellWeights;
  thresholds: UpsellThresholds;
  enabled: Record<keyof UpsellWeights, boolean>;
}

export const DEFAULT_UPSELL_CONFIG: UpsellConfig = {
  weights: {
    leadsSaturation: 35,
    leadsGrowth: 20,
    whatsappSaturation: 30,
    pipelineActivity: 15,
    highEngagement: 15,
    planUnderpriced: 10,
  },
  thresholds: {
    saturationWarn: 70,
    saturationCrit: 100,
    leadsGrowthWarn: 30,
    leadsGrowthCrit: 100,
    engagementMultiplierWarn: 1.5,
    engagementMultiplierCrit: 3,
    minLeadsForSignal: 5,
    warmScore: 35,
    hotScore: 65,
  },
  enabled: {
    leadsSaturation: true,
    leadsGrowth: true,
    whatsappSaturation: true,
    pipelineActivity: true,
    highEngagement: true,
    planUnderpriced: true,
  },
};

const FACTOR_LABELS: Record<keyof UpsellWeights, string> = {
  leadsSaturation:    'Saturação de leads no plano',
  leadsGrowth:        'Crescimento de leads',
  whatsappSaturation: 'Saturação de WhatsApp',
  pipelineActivity:   'Pipeline aquecido',
  highEngagement:     'Alto engajamento (mensagens)',
  planUnderpriced:    'Ticket abaixo do plano-alvo',
};

export interface UpsellFactor {
  key: keyof UpsellWeights;
  label: string;
  intensity: number;
  weight: number;
  contribution: number;
  description: string;
}

export interface UpsellScoreResult {
  score: number;
  category: 'cold' | 'warm' | 'hot';
  factors: UpsellFactor[];
  topReason: string;
}

export interface CompanyUpsellInput {
  // Atividade
  leadsPeriod: number;
  leadsPrev: number;
  pipelineHotLeads: number;          // leads em estágios avançados (won-likely)
  messagesPeriod: number;
  platformAvgMessages: number;

  // Plano atual
  currentPlanName: string;
  currentMrr: number;
  currentMaxLeads: number | null;
  currentMaxWhatsapp: number | null;

  // Uso vs limites
  whatsappInstancesActive: number;

  // Plano-alvo (próximo tier acima)
  targetPlanName: string | null;
  targetMrr: number | null;
}

function ramp(value: number, warn: number, crit: number) {
  if (crit <= warn) return value >= crit ? 1 : 0;
  if (value <= warn) return 0;
  if (value >= crit) return 1;
  return (value - warn) / (crit - warn);
}

export function scoreUpsell(input: CompanyUpsellInput, cfg: UpsellConfig = DEFAULT_UPSELL_CONFIG): UpsellScoreResult {
  const { weights, thresholds, enabled } = cfg;
  const factors: UpsellFactor[] = [];

  const tooSmall = input.leadsPeriod < thresholds.minLeadsForSignal;

  // 1. Saturação de leads no plano
  if (enabled.leadsSaturation && input.currentMaxLeads && input.currentMaxLeads > 0 && !tooSmall) {
    const usagePct = (input.leadsPeriod / input.currentMaxLeads) * 100;
    const intensity = ramp(usagePct, thresholds.saturationWarn, thresholds.saturationCrit);
    if (intensity > 0) {
      factors.push({
        key: 'leadsSaturation', label: FACTOR_LABELS.leadsSaturation, intensity,
        weight: weights.leadsSaturation,
        contribution: intensity * weights.leadsSaturation,
        description: `${Math.round(usagePct)}% do limite de leads do plano consumido (${input.leadsPeriod}/${input.currentMaxLeads})`,
      });
    }
  }

  // 2. Crescimento de leads vs período anterior
  if (enabled.leadsGrowth && input.leadsPrev >= thresholds.minLeadsForSignal) {
    const growthPct = ((input.leadsPeriod - input.leadsPrev) / input.leadsPrev) * 100;
    if (growthPct > 0) {
      const intensity = ramp(growthPct, thresholds.leadsGrowthWarn, thresholds.leadsGrowthCrit);
      if (intensity > 0) {
        factors.push({
          key: 'leadsGrowth', label: FACTOR_LABELS.leadsGrowth, intensity,
          weight: weights.leadsGrowth,
          contribution: intensity * weights.leadsGrowth,
          description: `+${Math.round(growthPct)}% de leads vs período anterior`,
        });
      }
    }
  }

  // 3. Saturação de WhatsApp
  if (enabled.whatsappSaturation && input.currentMaxWhatsapp && input.currentMaxWhatsapp > 0) {
    const usagePct = (input.whatsappInstancesActive / input.currentMaxWhatsapp) * 100;
    const intensity = ramp(usagePct, thresholds.saturationWarn, thresholds.saturationCrit);
    if (intensity > 0) {
      factors.push({
        key: 'whatsappSaturation', label: FACTOR_LABELS.whatsappSaturation, intensity,
        weight: weights.whatsappSaturation,
        contribution: intensity * weights.whatsappSaturation,
        description: `${input.whatsappInstancesActive}/${input.currentMaxWhatsapp} instâncias WhatsApp em uso (${Math.round(usagePct)}%)`,
      });
    }
  }

  // 4. Pipeline aquecido (leads em estágios avançados)
  if (enabled.pipelineActivity && input.pipelineHotLeads > 0 && input.leadsPeriod > 0) {
    const hotRatio = input.pipelineHotLeads / Math.max(1, input.leadsPeriod);
    // ramp em ratio: 20% warn, 60% crit
    const intensity = ramp(hotRatio * 100, 20, 60);
    if (intensity > 0) {
      factors.push({
        key: 'pipelineActivity', label: FACTOR_LABELS.pipelineActivity, intensity,
        weight: weights.pipelineActivity,
        contribution: intensity * weights.pipelineActivity,
        description: `${input.pipelineHotLeads} leads em estágios avançados do pipeline`,
      });
    }
  }

  // 5. Alto engajamento (mensagens vs média da plataforma)
  if (enabled.highEngagement && input.platformAvgMessages > 0 && input.messagesPeriod > 0) {
    const ratio = input.messagesPeriod / input.platformAvgMessages;
    const intensity = ramp(ratio, thresholds.engagementMultiplierWarn, thresholds.engagementMultiplierCrit);
    if (intensity > 0) {
      factors.push({
        key: 'highEngagement', label: FACTOR_LABELS.highEngagement, intensity,
        weight: weights.highEngagement,
        contribution: intensity * weights.highEngagement,
        description: `Volume de mensagens ${ratio.toFixed(1)}x acima da média da plataforma`,
      });
    }
  }

  // 6. Ticket subdimensionado (gap entre MRR atual e plano-alvo)
  if (enabled.planUnderpriced && input.targetMrr && input.targetMrr > input.currentMrr && input.currentMrr > 0) {
    const gapRatio = (input.targetMrr - input.currentMrr) / input.targetMrr;
    // ramp: 20% gap warn, 80% gap crit
    const intensity = ramp(gapRatio * 100, 20, 80);
    if (intensity > 0) {
      factors.push({
        key: 'planUnderpriced', label: FACTOR_LABELS.planUnderpriced, intensity,
        weight: weights.planUnderpriced,
        contribution: intensity * weights.planUnderpriced,
        description: `Ticket atual ${Math.round((1 - input.currentMrr / input.targetMrr) * 100)}% abaixo do plano ${input.targetPlanName}`,
      });
    }
  }

  const activeWeights = (Object.keys(weights) as (keyof UpsellWeights)[])
    .filter(k => enabled[k])
    .reduce((s, k) => s + weights[k], 0);

  const rawSum = factors.reduce((s, f) => s + f.contribution, 0);
  const score = activeWeights > 0 ? Math.min(100, Math.round((rawSum / activeWeights) * 100)) : 0;

  let category: UpsellScoreResult['category'] = 'cold';
  if (score >= thresholds.hotScore) category = 'hot';
  else if (score >= thresholds.warmScore) category = 'warm';

  factors.sort((a, b) => b.contribution - a.contribution);

  return {
    score,
    category,
    factors,
    topReason: factors[0]?.description || 'Sem sinais relevantes',
  };
}

/* ---------- Persistência ---------- */

const STORAGE_KEY = 'master.upsellConfig.v1';

export function loadUpsellConfig(): UpsellConfig {
  if (typeof window === 'undefined') return DEFAULT_UPSELL_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UPSELL_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      weights: { ...DEFAULT_UPSELL_CONFIG.weights, ...(parsed.weights || {}) },
      thresholds: { ...DEFAULT_UPSELL_CONFIG.thresholds, ...(parsed.thresholds || {}) },
      enabled: { ...DEFAULT_UPSELL_CONFIG.enabled, ...(parsed.enabled || {}) },
    };
  } catch {
    return DEFAULT_UPSELL_CONFIG;
  }
}

export function saveUpsellConfig(cfg: UpsellConfig) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function resetUpsellConfig() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
