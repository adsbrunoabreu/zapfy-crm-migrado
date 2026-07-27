import { memo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Calendar as CalendarIcon, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { endOfAppDay, getAppRangeForPreset } from '@/lib/appDate';
import type { ChatSearchFilters, ChatSearchMode, ChatSearchStatus } from '@/hooks/chat/useChatSearch';

interface Props {
  filters: ChatSearchFilters;
  onChange: (next: Partial<ChatSearchFilters>) => void;
  totalCount?: number;
}

const STATUS_OPTIONS: { value: ChatSearchStatus; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'unread', label: 'Não lidas' },
  { value: 'waiting', label: 'Aguardando' },
  { value: 'in_progress', label: 'Em atendimento' },
  { value: 'closed', label: 'Encerradas' },
];

const MODE_OPTIONS: { value: ChatSearchMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'text', label: 'Texto' },
  { value: 'phone', label: 'Telefone' },
];

const PRESETS: { key: string; label: string; getRange: () => { from: Date; to: Date } }[] = [
  { key: 'today', label: 'Hoje', getRange: () => getAppRangeForPreset('today') },
  { key: '7d', label: '7 dias', getRange: () => getAppRangeForPreset('7d') },
  { key: '30d', label: '30 dias', getRange: () => getAppRangeForPreset('30d') },
  { key: '90d', label: '90 dias', getRange: () => getAppRangeForPreset('90d') },
];

export const ChatSearchFiltersBar = memo(function ChatSearchFiltersBar({ filters, onChange, totalCount }: Props) {
  const dateLabel = filters.from || filters.to
    ? `${filters.from ? format(filters.from, 'dd/MM/yy', { locale: ptBR }) : '...'} – ${filters.to ? format(filters.to, 'dd/MM/yy', { locale: ptBR }) : 'hoje'}`
    : 'Período';

  return (
    <div className="flex flex-col gap-2 px-3 py-2 border-b border-border/50 bg-card/30">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Modo</span>
        {MODE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ mode: opt.value })}
            className={cn(
              'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
              filters.mode === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border/60 hover:bg-accent/40'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1">Status</span>
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange({ status: opt.value })}
            className={cn(
              'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
              filters.status === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border/60 hover:bg-accent/40'
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 px-2 text-xs gap-1.5">
              <CalendarIcon className="w-3.5 h-3.5" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="flex flex-wrap gap-1 mb-2">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onChange(p.getRange())}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-border/60 hover:bg-accent/40"
                >
                  {p.label}
                </button>
              ))}
              {(filters.from || filters.to) && (
                <button
                  type="button"
                  onClick={() => onChange({ from: null, to: null })}
                  className="text-[11px] px-2 py-0.5 rounded-full border border-border/60 hover:bg-accent/40 text-destructive"
                >
                  Limpar
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">De</p>
                <Calendar
                  mode="single"
                  selected={filters.from ?? undefined}
                  onSelect={(d) => onChange({ from: d ?? null })}
                  locale={ptBR}
                  className="p-0"
                />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Até</p>
                <Calendar
                  mode="single"
                  selected={filters.to ?? undefined}
                  onSelect={(d) => {
                    if (d) {
                      onChange({ to: endOfAppDay(d) });
                    } else {
                      onChange({ to: null });
                    }
                  }}
                  locale={ptBR}
                  className="p-0"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={() => onChange({ onlyAttachments: !filters.onlyAttachments })}
          className={cn(
            'inline-flex items-center gap-1 text-[11px] h-7 px-2 rounded-full border transition-colors',
            filters.onlyAttachments
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border/60 hover:bg-accent/40'
          )}
        >
          <Paperclip className="w-3 h-3" />
          Anexos
        </button>

        {(filters.status !== 'all' || filters.from || filters.to || filters.onlyAttachments || filters.mode !== 'auto') && (
          <button
            type="button"
            onClick={() => onChange({ mode: 'auto', status: 'all', from: null, to: null, onlyAttachments: false })}
            className="inline-flex items-center gap-1 text-[11px] h-7 px-2 rounded-full border border-border/60 hover:bg-accent/40 text-muted-foreground"
          >
            <X className="w-3 h-3" />
            Limpar filtros
          </button>
        )}

        {typeof totalCount === 'number' && (
          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
            {totalCount} {totalCount === 1 ? 'conversa' : 'conversas'}
          </span>
        )}
      </div>
    </div>
  );
});
