import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { APP_WEEK_STARTS_ON, getAppRangeForPreset, getAppToday } from '@/lib/appDate';

export type DateRange = { from: Date; to: Date };

export interface RangePreset {
  key: string;
  label: string;
  /** returns the range when this preset is clicked */
  getRange: () => DateRange;
}

export const DEFAULT_PRESETS: RangePreset[] = [
  { key: 'today', label: 'Hoje', getRange: () => getAppRangeForPreset('today') },
  { key: 'yesterday', label: 'Ontem', getRange: () => getAppRangeForPreset('yesterday') },
  { key: '7d', label: 'Últimos 7 dias', getRange: () => getAppRangeForPreset('7d') },
  { key: '15d', label: 'Últimos 15 dias', getRange: () => getAppRangeForPreset('15d') },
  { key: '30d', label: 'Últimos 30 dias', getRange: () => getAppRangeForPreset('30d') },
  { key: '60d', label: 'Últimos 60 dias', getRange: () => getAppRangeForPreset('60d') },
  { key: '90d', label: 'Últimos 90 dias', getRange: () => getAppRangeForPreset('90d') },
  { key: 'mtd', label: 'Este mês', getRange: () => getAppRangeForPreset('mtd') },
  { key: 'ytd', label: 'Este ano', getRange: () => getAppRangeForPreset('ytd') },
];

const RELATIVE_PRESET_KEYS = new Set(DEFAULT_PRESETS.map((preset) => preset.key));

interface Props {
  value?: DateRange;
  onChange: (range: DateRange, presetKey?: string) => void;
  presets?: RangePreset[];
  /** Key of the currently active preset, if any */
  activePresetKey?: string;
  align?: 'start' | 'center' | 'end';
  className?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  numberOfMonths?: number;
}

function formatRange(range?: DateRange) {
  if (!range?.from) return null;
  const sameYear = range.to && range.from.getFullYear() === range.to.getFullYear();
  const fmt = (d: Date) => format(d, sameYear ? "d 'de' MMM" : "d 'de' MMM yyyy", { locale: ptBR });
  if (!range.to) return fmt(range.from);
  if (range.from.getTime() === range.to.getTime()) return format(range.from, "d 'de' MMM yyyy", { locale: ptBR });
  return `${fmt(range.from)} - ${format(range.to, "d 'de' MMM yyyy", { locale: ptBR })}`;
}

export function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_PRESETS,
  activePresetKey,
  align = 'start',
  className,
  placeholder = 'Selecione o período',
  size = 'md',
  numberOfMonths = 2,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const fromTime = value?.from?.getTime();
  const toTime = value?.to?.getTime();
  const effectiveValue = React.useMemo<DateRange | undefined>(() => {
    if (activePresetKey && RELATIVE_PRESET_KEYS.has(activePresetKey)) return getAppRangeForPreset(activePresetKey);
    if (fromTime == null || toTime == null) return undefined;
    return { from: new Date(fromTime), to: new Date(toTime) };
  }, [activePresetKey, fromTime, toTime]);
  const [draft, setDraft] = React.useState<{ from?: Date; to?: Date }>(effectiveValue ?? {});
  // Tracks whether the user has started a NEW custom range in the current popover session.
  // Until they click the first date here, we ignore the prefilled `value` so a single click
  // doesn't auto-complete against the existing range and close the popover.
  const pickingRef = React.useRef(false);

  React.useEffect(() => { if (effectiveValue) setDraft(effectiveValue); }, [effectiveValue]);

  // Reset picking state whenever the popover opens, and refresh draft from current value.
  React.useEffect(() => {
    if (open) {
      pickingRef.current = false;
      setDraft(effectiveValue ?? {});
    }
  }, [open, effectiveValue]);

  const handlePreset = (p: RangePreset) => {
    const r = p.getRange();
    setDraft(r);
    onChange(r, p.key);
    setOpen(false);
  };

  const handleSelect = (r: any) => {
    // First click of a fresh selection: force start of a new range from the clicked day,
    // even if `selected` was prefilled with the active preset.
    if (!pickingRef.current) {
      pickingRef.current = true;
      const start = r?.from ?? r?.to;
      setDraft(start ? { from: start, to: undefined } : {});
      return;
    }
    setDraft(r ?? {});
    if (r?.from && r?.to && r.from.getTime() !== r.to.getTime()) {
      onChange({ from: r.from, to: r.to }, 'custom');
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'justify-start gap-2 font-normal text-xs bg-card border-border hover:bg-secondary/60',
            size === 'sm' ? 'h-8 px-2.5' : 'h-9 px-3',
            !effectiveValue && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5 opacity-70" />
          {formatRange(effectiveValue) ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        className="w-auto p-0 overflow-hidden bg-popover border-border"
      >
        <div className="flex">
          <div className="w-[170px] shrink-0 border-r border-border p-2 space-y-0.5 bg-card/40">
            <p className="px-2 pb-1 pt-1 text-[11px] font-medium text-muted-foreground tracking-wide uppercase">
              Selecione
            </p>
            {presets.map(p => {
              const active = activePresetKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handlePreset(p)}
                  className={cn(
                    'w-full text-left text-xs h-8 px-2 rounded-md transition-colors',
                    active
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-foreground/80 hover:bg-secondary hover:text-foreground'
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div>
            <Calendar
              mode="range"
              selected={draft as any}
              onSelect={handleSelect}
              numberOfMonths={numberOfMonths}
              locale={ptBR}
              weekStartsOn={APP_WEEK_STARTS_ON}
              today={getAppToday()}
              defaultMonth={effectiveValue?.from ?? draft.from}
              className="p-3 pointer-events-auto"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
