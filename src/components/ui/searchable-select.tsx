/**
 * Select com busca por digitação. Espelha a API básica de <Select>:
 *   <SearchableSelect value={v} onValueChange={fn} options={[{value,label,hint?}]} />
 *
 * - Ordena automaticamente as opções por label usando colação pt-BR
 *   (acentos não atrapalham a ordem alfabética).
 * - Filtro client-side via cmdk.
 * - Usado nos catálogos médicos (convênios, médicos, procedimentos, hospitais/clínicas).
 */
import * as React from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  hint?: string;
  disabled?: boolean;
}

interface Props {
  value?: string | null;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  allowClear?: boolean;
  clearLabel?: string;
}

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = 'Selecione',
  searchPlaceholder = 'Buscar...',
  emptyText = 'Nenhum item encontrado.',
  disabled,
  className,
  contentClassName,
  allowClear = false,
  clearLabel = 'Limpar seleção',
}: Props) {
  const [open, setOpen] = React.useState(false);

  const sorted = React.useMemo(() => {
    return [...options].sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }),
    );
  }, [options]);

  const selected = sorted.find((o) => o.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between font-normal',
            !selected && 'text-muted-foreground',
            className,
          )}
        >
          <span className="truncate text-left">
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn('p-0 w-[--radix-popover-trigger-width] min-w-[240px]', contentClassName)}
        align="start"
      >
        <Command
          filter={(itemValue, search) => {
            // cmdk passa o `value` que setamos em CommandItem (label normalizado).
            const haystack = itemValue.toLowerCase();
            const needle = search.toLowerCase().trim();
            if (!needle) return 1;
            return haystack.includes(needle) ? 1 : 0;
          }}
        >
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {allowClear && selected && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onValueChange('');
                    setOpen(false);
                  }}
                  className="text-xs text-muted-foreground"
                >
                  {clearLabel}
                </CommandItem>
              )}
              {sorted.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  disabled={opt.disabled}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      opt.value === value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="flex-1 truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="ml-2 text-[10px] font-mono text-muted-foreground">
                      {opt.hint}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
