import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  key: K | null;
  direction: SortDirection;
}

export type SortAccessor<T> = (row: T) => string | number | Date | null | undefined;

/**
 * Hook padrão de ordenação para listas/tabelas.
 * - Clique na coluna alterna asc → desc → asc
 * - Suporta acessores custom por chave (ex: campos aninhados)
 */
export function useSortableData<T, K extends string = string>(
  data: T[] | undefined,
  accessors: Partial<Record<K, SortAccessor<T>>>,
  initial: SortState<K> = { key: null, direction: 'asc' },
) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sorted = useMemo(() => {
    const list = data ? [...data] : [];
    if (!sort.key) return list;
    const accessor = accessors[sort.key];
    if (!accessor) return list;
    const dir = sort.direction === 'asc' ? 1 : -1;
    return list.sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va instanceof Date || vb instanceof Date) {
        return (((va as Date)?.getTime?.() ?? 0) - ((vb as Date)?.getTime?.() ?? 0)) * dir;
      }
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, sort, accessors]);

  const toggle = (key: K) => {
    setSort((s) => {
      if (s.key !== key) return { key, direction: 'asc' };
      return { key, direction: s.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  return { sorted, sort, toggle, setSort };
}
