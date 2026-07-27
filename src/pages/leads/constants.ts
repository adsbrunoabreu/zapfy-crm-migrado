export const statusConfig: Record<string, { label: string; className: string }> = {
  new: { label: 'Novo', className: 'bg-cyan/20 text-cyan border-cyan/30' },
  contacted: { label: 'Contactado', className: 'bg-amber/20 text-amber border-amber/30' },
  qualified: { label: 'Qualificado', className: 'bg-violet/20 text-violet border-violet/30' },
  proposal: { label: 'Proposta', className: 'bg-rose/20 text-rose border-rose/30' },
  negotiation: { label: 'Negociação', className: 'bg-orange/20 text-orange border-orange/30' },
  won: { label: 'Fechado', className: 'bg-emerald/20 text-emerald border-emerald/30' },
  lost: { label: 'Perdido', className: 'bg-muted/50 text-muted-foreground border-muted/30' },
};

const stageColorMap: Record<string, string> = {
  'novo': 'bg-cyan/15 text-cyan border-cyan/30',
  'new': 'bg-cyan/15 text-cyan border-cyan/30',
  'em contato': 'bg-amber/15 text-amber border-amber/30',
  'contato': 'bg-amber/15 text-amber border-amber/30',
  'contacted': 'bg-amber/15 text-amber border-amber/30',
  'negociando': 'bg-orange/15 text-orange border-orange/30',
  'negociação': 'bg-orange/15 text-orange border-orange/30',
  'negotiation': 'bg-orange/15 text-orange border-orange/30',
  'proposta': 'bg-violet/15 text-violet border-violet/30',
  'proposal': 'bg-violet/15 text-violet border-violet/30',
  'fechado': 'bg-emerald/15 text-emerald border-emerald/30',
  'won': 'bg-emerald/15 text-emerald border-emerald/30',
  'ganho': 'bg-emerald/15 text-emerald border-emerald/30',
  'perdido': 'bg-destructive/15 text-destructive border-destructive/30',
  'lost': 'bg-destructive/15 text-destructive border-destructive/30',
  'qualificado': 'bg-violet/15 text-violet border-violet/30',
  'qualified': 'bg-violet/15 text-violet border-violet/30',
};

export function getStageClassName(stageName: string | undefined): string {
  if (!stageName) return 'bg-muted/50 text-muted-foreground border-border/50';
  return stageColorMap[stageName.toLowerCase().trim()] || 'bg-muted/50 text-muted-foreground border-border/50';
}

export function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export interface LeadFilters {
  status: string[];
  pipelineId: string | null;
  assignedTo: string | null;
  minValue: string;
  maxValue: string;
  dateFrom: Date | null;
  dateTo: Date | null;
}

export const defaultFilters: LeadFilters = {
  status: [],
  pipelineId: null,
  assignedTo: null,
  minValue: '',
  maxValue: '',
  dateFrom: null,
  dateTo: null,
};

export type SortKey = 'code' | 'name' | 'pipeline' | 'stage' | 'assignee' | 'value' | 'status' | 'created_at';

export const formatCurrency = (value: number | null) => {
  if (!value) return 'R$ 0';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 }).format(value);
};

export const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
