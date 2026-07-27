/**
 * Mapeamento único para status de attendance_ticket.
 * Mantém label (pt-BR), classe Tailwind do dot e tom semântico.
 *
 * Sempre use os helpers `getTicketStatusLabel` / `getTicketStatusDot` /
 * `getTicketStatusTone` para garantir fallback seguro em valores inesperados.
 */

import type { StatusTone } from '@/lib/statusUI';

export type TicketStatus = 'open' | 'in_progress' | 'closed' | 'reopened' | 'awaiting_rating';

export interface TicketStatusMeta {
  label: string;
  /** classe utilitária Tailwind (bg-*) para um dot */
  dot: string;
  tone: StatusTone;
}

export const TICKET_STATUS_META: Record<TicketStatus, TicketStatusMeta> = {
  open:            { label: 'Aberto',                dot: 'bg-emerald-500', tone: 'success' },
  in_progress:     { label: 'Em atendimento',        dot: 'bg-blue-500',    tone: 'info'    },
  awaiting_rating: { label: 'Aguardando avaliação',  dot: 'bg-violet-500',  tone: 'info'    },
  closed:          { label: 'Encerrado',             dot: 'bg-zinc-500',    tone: 'muted'   },
  reopened:        { label: 'Reaberto',              dot: 'bg-amber-500',   tone: 'warning' },
};

const FALLBACK: TicketStatusMeta = {
  label: 'Desconhecido',
  dot: 'bg-zinc-400',
  tone: 'muted',
};

export function getTicketStatusMeta(status?: string | null): TicketStatusMeta {
  if (!status) return FALLBACK;
  return TICKET_STATUS_META[status as TicketStatus] ?? FALLBACK;
}

export const getTicketStatusLabel = (s?: string | null) => getTicketStatusMeta(s).label;
export const getTicketStatusDot   = (s?: string | null) => getTicketStatusMeta(s).dot;
export const getTicketStatusTone  = (s?: string | null) => getTicketStatusMeta(s).tone;

/** Retrocompatibilidade — preferir os getters acima. */
export const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(TICKET_STATUS_META).map(([k, v]) => [k, v.label]),
);
export const STATUS_DOT: Record<string, string> = Object.fromEntries(
  Object.entries(TICKET_STATUS_META).map(([k, v]) => [k, v.dot]),
);
