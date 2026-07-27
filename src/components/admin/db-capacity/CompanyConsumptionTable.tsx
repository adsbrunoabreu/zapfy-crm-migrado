import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { TableRowSkeleton } from '@/components/ui/table-row-skeleton';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useSortableData } from '@/hooks/useSortableData';
import { Badge } from '@/components/ui/badge';
import { formatBytes, formatNumber, type CompanyUsage } from '@/hooks/useDbCapacity';
import { cn } from '@/lib/utils';

interface Props {
  companies?: CompanyUsage[];
  loading?: boolean;
  onSelect: (c: CompanyUsage) => void;
}

export function CompanyConsumptionTable({ companies, loading, onSelect }: Props) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return companies ?? [];
    return (companies ?? []).filter((c) =>
      c.company_name?.toLowerCase().includes(term) || c.plan_name?.toLowerCase().includes(term)
    );
  }, [companies, q]);

  const { sorted, sort, toggle } = useSortableData<CompanyUsage>(
    filtered,
    {
      company_name: (r) => r.company_name,
      plan_name: (r) => r.plan_name,
      leads_count: (r) => r.leads_count,
      messages_count: (r) => r.messages_count,
      products_count: (r) => r.products_count,
      media_bytes: (r) => r.media_bytes,
      estimated_total_bytes: (r) => r.estimated_total_bytes,
    },
    { key: 'estimated_total_bytes', direction: 'desc' }
  );
  const sortKey = sort.key;
  const direction = sort.direction;
  const handleSort = (k: string) => toggle(k);
  const sortedData = sorted;

  const max = useMemo(
    () => Math.max(1, ...(companies ?? []).map((c) => c.estimated_total_bytes || 0)),
    [companies]
  );

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Consumo por empresa</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estimativa baseada em contagens + storage de mídia.
          </p>
        </div>
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar empresa…"
            className="pl-8 h-8 text-xs"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <SortableTableHead label="Empresa" sortKey="company_name" active={sortKey === 'company_name'} direction={direction} onSort={handleSort} />
              <SortableTableHead label="Plano" sortKey="plan_name" active={sortKey === 'plan_name'} direction={direction} onSort={handleSort} />
              <SortableTableHead label="Leads" sortKey="leads_count" active={sortKey === 'leads_count'} direction={direction} onSort={handleSort} align="right" />
              <SortableTableHead label="Mensagens" sortKey="messages_count" active={sortKey === 'messages_count'} direction={direction} onSort={handleSort} align="right" />
              <SortableTableHead label="Produtos" sortKey="products_count" active={sortKey === 'products_count'} direction={direction} onSort={handleSort} align="right" />
              <SortableTableHead label="Mídia" sortKey="media_bytes" active={sortKey === 'media_bytes'} direction={direction} onSort={handleSort} align="right" />
              <SortableTableHead label="Total estimado" sortKey="estimated_total_bytes" active={sortKey === 'estimated_total_bytes'} direction={direction} onSort={handleSort} align="right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRowSkeleton columns={7} rows={6} />
            ) : !sortedData.length ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6 text-sm">Nenhuma empresa.</TableCell></TableRow>
            ) : sortedData.map((c) => {
              const pct = ((c.estimated_total_bytes || 0) / max) * 100;
              return (
                <TableRow
                  key={c.company_id}
                  className="cursor-pointer hover:bg-muted/40"
                  onClick={() => onSelect(c)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{c.company_name}</span>
                      {c.company_status !== 'active' && (
                        <Badge variant="secondary" className="text-[10px] uppercase">{c.company_status}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.plan_name}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatNumber(c.leads_count)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatNumber(c.messages_count)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{formatNumber(c.products_count)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{formatBytes(c.media_bytes)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn('h-full rounded-full', pct > 66 ? 'bg-destructive' : pct > 33 ? 'bg-amber' : 'bg-emerald')}
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                      <span className="text-sm tabular-nums w-20 text-right">{formatBytes(c.estimated_total_bytes)}</span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
