import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLossReasonLabel } from './hooks';

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  new: { label: 'Novo', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  contacted: { label: 'Contactado', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  qualified: { label: 'Qualificado', cls: 'bg-violet-500/15 text-violet-400 border-violet-500/30' },
  proposal: { label: 'Proposta', cls: 'bg-amber/15 text-amber border-amber/30' },
  negotiation: { label: 'Negociação', cls: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  won: { label: 'Ganho', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  lost: { label: 'Perdido', cls: 'bg-destructive/15 text-destructive border-destructive/30' },
};

export const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export const formatFileSize = (bytes: number | null) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb < 1024 ? `${kb.toFixed(1)} KB` : `${(kb / 1024).toFixed(1)} MB`;
};

export function LossReasonInline({ reasonId, fallback }: { reasonId?: string | null; fallback?: string | null }) {
  const { data } = useLossReasonLabel(reasonId);
  if (reasonId && data) return <>{data}{fallback ? ` — ${fallback}` : ''}</>;
  return <>{fallback || '—'}</>;
}

export function DrawerCollapsible({
  icon, label, open, onToggle, children,
}: {
  icon?: React.ReactNode;
  label: string;
  open: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between rounded-xl border border-border bg-card/40 px-4 py-3 hover:bg-accent/30 transition-colors"
        >
          <span className="text-sm font-semibold flex items-center gap-2">
            {icon && <span className="text-muted-foreground">{icon}</span>}
            {label}
          </span>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
