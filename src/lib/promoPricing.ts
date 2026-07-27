/**
 * Preços normais (não-promocionais) por plano.
 * Os valores atuais cobrados são preços promocionais de lançamento.
 */
export function getNormalMonthlyPrice(planName?: string | null): number | null {
  if (!planName) return null;
  const n = planName.toLowerCase();
  if (n.includes('starter') || n.includes('start')) return 197;
  if (n.includes('pro') && !n.includes('enterprise')) return 397;
  if (n.includes('business') || n.includes('enterprise')) return 597;
  return null;
}

export function formatBRL(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export const PROMO_LABEL = 'Valores promocionais de lançamento';
