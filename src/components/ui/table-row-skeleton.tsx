import { TableCell, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

interface TableRowSkeletonProps {
  /** Número de colunas */
  columns: number;
  /** Quantas linhas renderizar */
  rows?: number;
}

/**
 * Skeleton padrão para body de tabela.
 * Usar no lugar de spinner central durante loading inicial.
 */
export function TableRowSkeleton({ columns, rows = 5 }: TableRowSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r} className="hover:bg-transparent">
          {Array.from({ length: columns }).map((_, c) => (
            <TableCell key={c}>
              <Skeleton className="h-4 w-full max-w-[160px]" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
