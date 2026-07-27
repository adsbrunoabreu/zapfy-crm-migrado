import { Calendar as CalendarIcon, DollarSign, Trophy, XCircle } from 'lucide-react';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { STATUS_META, fmtBRL, LossReasonInline } from './shared';
import { useLeadContact } from '@/hooks/useLeadContact';

interface Props {
  edited: { name: string; value: string; status: string; phone?: string };
  fallbackName: string;
  createdAt: string;
  fullLead: any;
  leadId: string;
}

export function LeadHeader({ edited, fallbackName, createdAt, fullLead, leadId }: Props) {
  const displayName = (edited.name || fallbackName || '').trim() || 'Sem nome';
  const initial = displayName[0]?.toUpperCase() || '?';
  const { data: contact } = useLeadContact(leadId, edited.phone ?? null);
  const avatarUrl = contact?.linked?.contact_photo_url || null;
  const numValue = parseFloat(String(edited.value).replace(',', '.'));
  const hasValue = Number.isFinite(numValue) && numValue > 0;
  const created = createdAt ? new Date(createdAt) : null;
  const validDate = created && !isNaN(created.getTime()) ? created : null;
  const stMeta = STATUS_META[edited.status] || { label: edited.status, cls: '' };
  const stageName: string | null = fullLead?.stage?.name || null;
  const stageColor: string | null = fullLead?.stage?.color || null;
  const isClosed = edited.status === 'won' || edited.status === 'lost';

  return (
    <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center shrink-0 overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-semibold text-primary">{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <SheetTitle className="text-base truncate">{displayName}</SheetTitle>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {isClosed ? (
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5 gap-1', stMeta.cls)}>
                {edited.status === 'won' ? <Trophy className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {stMeta.label}
              </Badge>
            ) : stageName ? (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 gap-1"
                style={stageColor ? { color: stageColor, borderColor: `${stageColor}55`, backgroundColor: `${stageColor}1a` } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                {stageName}
              </Badge>
            ) : (
              <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5 gap-1', stMeta.cls)}>
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                {stMeta.label}
              </Badge>
            )}
            {hasValue && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 font-mono">
                <DollarSign className="w-3 h-3" />
                {fmtBRL(numValue)}
              </Badge>
            )}
            {validDate && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 text-muted-foreground">
                <CalendarIcon className="w-3 h-3" />
                {format(validDate, "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
              </Badge>
            )}
          </div>
        </div>
      </div>
      {edited.status === 'won' && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
          <Trophy className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="text-xs text-emerald-400">
            <span className="font-semibold">Oportunidade ganha</span>
            {fullLead?.closed_at && (
              <span className="ml-1 opacity-80">
                em {format(new Date(fullLead.closed_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
              </span>
            )}
          </div>
        </div>
      )}
      {edited.status === 'lost' && (fullLead?.loss_reason_text || fullLead?.loss_reason_id) && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
          <XCircle className="w-4 h-4 text-destructive shrink-0" />
          <div className="text-xs text-destructive">
            <span className="font-semibold">Motivo da perda: </span>
            <LossReasonInline reasonId={fullLead?.loss_reason_id} fallback={fullLead?.loss_reason_text} />
          </div>
        </div>
      )}
    </SheetHeader>
  );
}
