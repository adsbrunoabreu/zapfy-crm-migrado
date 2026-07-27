import * as React from 'react';
import { Calendar as CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  value?: Date;
  onChange: (date?: Date) => void;
  placeholder?: string;
  disabled?: (date: Date) => boolean;
  className?: string;
  align?: 'start' | 'center' | 'end';
  size?: 'sm' | 'md';
  fromYear?: number;
  toYear?: number;
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Selecione uma data',
  disabled,
  className,
  align = 'start',
  size = 'md',
  fromYear,
  toYear,
}: Props) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'justify-start gap-2 font-normal text-xs bg-card border-border hover:bg-secondary/60',
            size === 'sm' ? 'h-8 px-2.5' : 'h-9 px-3',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <CalendarIcon className="w-3.5 h-3.5 opacity-70" />
          {value ? format(value, "d 'de' MMM yyyy", { locale: ptBR }) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0 bg-popover border-border">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => { onChange(d ?? undefined); setOpen(false); }}
          disabled={disabled}
          locale={ptBR}
          defaultMonth={value}
          captionLayout={fromYear || toYear ? 'dropdown-buttons' : undefined}
          fromYear={fromYear}
          toYear={toYear}
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}
