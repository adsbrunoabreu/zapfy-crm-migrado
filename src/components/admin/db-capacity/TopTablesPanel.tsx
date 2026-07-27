import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TableRowSkeleton } from '@/components/ui/table-row-skeleton';
import { Badge } from '@/components/ui/badge';
import { formatBytes, formatNumber, type TopTable } from '@/hooks/useDbCapacity';

interface Props {
  tables?: TopTable[];
  loading?: boolean;
}

export function TopTablesPanel({ tables, loading }: Props) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Top tabelas por consumo</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Inclui dados + índices. Bloat alto sugere VACUUM.</p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs">Tabela</TableHead>
              <TableHead className="text-xs text-right">Linhas</TableHead>
              <TableHead className="text-xs text-right">Tamanho total</TableHead>
              <TableHead className="text-xs text-right">Índices</TableHead>
              <TableHead className="text-xs text-right">Dead tuples</TableHead>
              <TableHead className="text-xs text-right">Bloat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRowSkeleton columns={6} rows={6} />
            ) : !tables?.length ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6 text-sm">Sem dados.</TableCell></TableRow>
            ) : tables.map((t) => (
              <TableRow key={t.table_name} className="hover:bg-muted/30">
                <TableCell className="font-mono text-xs">{t.table_name}</TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(t.live_rows)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatBytes(t.total_bytes)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatBytes(t.index_bytes)}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(t.dead_rows)}</TableCell>
                <TableCell className="text-right">
                  {t.bloat_pct >= 20 ? (
                    <Badge variant="destructive" className="text-[10px]">{t.bloat_pct}%</Badge>
                  ) : t.bloat_pct >= 10 ? (
                    <Badge variant="secondary" className="text-[10px]">{t.bloat_pct}%</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground tabular-nums">{t.bloat_pct}%</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
