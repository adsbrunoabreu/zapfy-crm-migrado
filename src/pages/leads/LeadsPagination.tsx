import { memo, useMemo } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const LeadsPagination = memo(function LeadsPagination({ totalItems, itemsPerPage, currentPage, totalPages, onPageChange }: Props) {
  const pageItems = useMemo<(number | 'ellipsis')[]>(() => {
    const arr = Array.from({ length: totalPages }, (_, i) => i + 1).filter(page => {
      if (totalPages <= 7) return true;
      if (page === 1 || page === totalPages) return true;
      return Math.abs(page - currentPage) <= 1;
    });
    return arr.reduce<(number | 'ellipsis')[]>((acc, page, idx) => {
      if (idx > 0 && page - (acc[acc.length - 1] as number) > 1) acc.push('ellipsis');
      acc.push(page);
      return acc;
    }, []);
  }, [totalPages, currentPage]);

  if (totalItems <= itemsPerPage) return null;

  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">
        Mostrando {((currentPage - 1) * itemsPerPage) + 1}–{Math.min(currentPage * itemsPerPage, totalItems)} de {totalItems}
      </p>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => onPageChange(Math.max(1, currentPage - 1))}>
          Anterior
        </Button>
        {pageItems.map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`e-${idx}`} className="px-2 text-muted-foreground">…</span>
          ) : (
            <Button
              key={item}
              variant={item === currentPage ? 'default' : 'outline'}
              size="sm"
              className="min-w-[36px]"
              onClick={() => onPageChange(item as number)}
            >
              {item}
            </Button>
          )
        )}
        <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}>
          Próximo
        </Button>
      </div>
    </div>
  );
});
