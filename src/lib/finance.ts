export const formatBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v ?? 0));

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  pending: 'Pendente',
  partial: 'Parcial',
  paid: 'Pago',
  overdue: 'Atrasado',
  canceled: 'Cancelado',
};

export const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-zinc-700 text-zinc-200',
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  partial: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  paid: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  overdue: 'bg-red-500/15 text-red-400 border-red-500/30',
  canceled: 'bg-zinc-800 text-zinc-500',
};

export function computedStatus(e: { status: string; due_date: string | null; paid_at: string | null }) {
  if (e.status === 'paid' || e.status === 'canceled' || e.status === 'partial' || e.status === 'draft') return e.status;
  if (e.due_date && !e.paid_at) {
    const today = new Date().toISOString().slice(0, 10);
    if (e.due_date < today) return 'overdue';
  }
  return e.status;
}
