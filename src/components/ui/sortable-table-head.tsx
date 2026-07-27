import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { SortDirection } from '@/hooks/useSortableData';

interface SortableTableHeadProps {
  label: string;
  sortKey: string;
  active: boolean;
  direction: SortDirection;
  onSort: (key: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** Quando false, renderiza apenas como TableHead sem botão */
  sortable?: boolean;
}

/**
 * Cabeçalho padrão para tabelas do sistema com suporte a ordenação por coluna.
 * - text-xs uppercase muted
 * - clique alterna asc/desc
 * - seta indica coluna ativa
 */
export function SortableTableHead({
  label,
  sortKey,
  active,
  direction,
  onSort,
  align = 'left',
  className,
  sortable = true,
}: SortableTableHeadProps) {
  const Icon = !active ? ChevronsUpDown : direction === 'asc' ? ArrowUp : ArrowDown;
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';

  return (
    <TableHead
      className={cn(
        'text-xs font-medium text-muted-foreground normal-case',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={cn(
            'inline-flex items-center gap-1 hover:text-foreground transition-colors',
            justify,
            active && 'text-foreground',
          )}
        >
          {label}
          <Icon className={cn('h-3 w-3', !active && 'opacity-40')} />
        </button>
      ) : (
        label
      )}
    </TableHead>
  );
}
