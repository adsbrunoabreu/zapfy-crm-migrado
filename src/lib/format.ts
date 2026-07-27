/**
 * Formatadores compartilhados (pt-BR).
 * Centraliza moeda e label de período usados nos dashboards.
 */

export function formatBRL(v: number, opts?: { fraction?: boolean }) {
  const fraction = opts?.fraction ?? false;
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: fraction ? 2 : 0,
    maximumFractionDigits: fraction ? 2 : 0,
  });
}

export type DashboardPeriodLike =
  | 'today'
  | 'yesterday'
  | '7d'
  | '15d'
  | '30d'
  | '90d'
  | 'ytd'
  | 'custom'
  | string;

export function formatPeriodLabel(
  period: DashboardPeriodLike,
  range?: { from: Date; to: Date },
): string {
  switch (period) {
    case 'today': return 'Hoje';
    case 'yesterday': return 'Ontem';
    case '7d': return 'Últimos 7 dias';
    case '15d': return 'Últimos 15 dias';
    case '30d': return 'Últimos 30 dias';
    case '90d': return 'Últimos 90 dias';
    case 'ytd': return 'Desde o início do ano';
    default:
      if (range) {
        const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
        return `${fmt(range.from)} – ${fmt(range.to)}`;
      }
      return 'Período personalizado';
  }
}

/**
 * Escapa um valor para CSV de forma segura, prevenindo CSV injection
 * (Excel/Sheets executam fórmulas em células iniciadas por = + - @ TAB CR).
 */
export function csvEscape(v: unknown): string {
  if (v == null) return '';
  let s = String(v).replace(/"/g, '""');
  // CSV injection guard
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",;\n\r\t]/.test(s) ? `"${s}"` : s;
}

/**
 * Formata o código sequencial do lead por empresa (tenant) com 4 dígitos:
 * 1 -> "#0001", 42 -> "#0042", 10000 -> "#10000".
 */
export function formatLeadCode(seq: number | null | undefined): string {
  if (seq === null || seq === undefined) return '';
  return `#${String(seq).padStart(4, '0')}`;
}
