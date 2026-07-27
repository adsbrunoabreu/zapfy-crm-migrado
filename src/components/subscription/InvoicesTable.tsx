import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useSortableData } from '@/hooks/useSortableData';
import { useInvoices, Invoice } from '@/hooks/useInvoices';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Receipt, Download } from 'lucide-react';
import { toast } from 'sonner';

interface Props { companyId?: string }

const formatBRL = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const statusMap: Record<Invoice['status'], { label: string; className: string }> = {
  paid:     { label: 'Paga',       className: 'bg-emerald/15 text-emerald border-emerald/30' },
  open:     { label: 'Em aberto',  className: 'bg-cyan/15 text-cyan border-cyan/30' },
  past_due: { label: 'Vencida',    className: 'bg-amber/15 text-amber border-amber/30' },
  void:     { label: 'Anulada',    className: 'bg-muted text-muted-foreground border-border' },
  refunded: { label: 'Reembolsada', className: 'bg-rose/15 text-rose border-rose/30' },
};

type SortKey = 'invoice_number' | 'period_start' | 'amount' | 'status' | 'issued_at';

export function InvoicesTable({ companyId }: Props) {
  const { data: invoices, isLoading } = useInvoices(companyId);

  const accessors = useMemo(() => ({
    invoice_number: (i: Invoice) => i.invoice_number,
    period_start: (i: Invoice) => new Date(i.period_start),
    amount: (i: Invoice) => Number(i.amount),
    status: (i: Invoice) => i.status,
    issued_at: (i: Invoice) => new Date(i.issued_at),
  }), []);
  const { sorted, sort, toggle } = useSortableData<Invoice, SortKey>(invoices, accessors, { key: 'issued_at', direction: 'desc' });

  return (
    <Card className="glass-card p-6">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-primary" />
        <h2 className="font-display text-lg font-semibold">Histórico de faturas</h2>
      </div>

      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(3)].map((_, i) => <div key={i} className="h-10 bg-muted/40 rounded" />)}
        </div>
      ) : !invoices || invoices.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Ainda não há faturas. A primeira será gerada na próxima renovação.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border hover:bg-transparent">
                <SortableTableHead label="Nº" sortKey="invoice_number" active={sort.key === 'invoice_number'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
                <SortableTableHead label="Período" sortKey="period_start" active={sort.key === 'period_start'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
                <SortableTableHead label="Valor" sortKey="amount" active={sort.key === 'amount'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
                <SortableTableHead label="Status" sortKey="status" active={sort.key === 'status'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
                <SortableTableHead label="Emitida" sortKey="issued_at" active={sort.key === 'issued_at'} direction={sort.direction} onSort={(k) => toggle(k as SortKey)} />
                <TableHead className="text-xs font-medium text-muted-foreground normal-case text-right">PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border">
              {sorted.map((inv) => {
                const s = statusMap[inv.status] || statusMap.open;
                return (
                  <TableRow key={inv.id} className="border-0 hover:bg-muted/40 transition-colors">
                    <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {format(new Date(inv.period_start), 'dd/MM/yyyy', { locale: ptBR })}
                      {' → '}
                      {format(new Date(inv.period_end), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="font-medium tabular-nums">{formatBRL(Number(inv.amount))}</TableCell>
                    <TableCell><Badge variant="outline" className={s.className}>{s.label}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {format(new Date(inv.issued_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost" size="sm"
                        onClick={() =>
                          inv.pdf_url
                            ? window.open(inv.pdf_url, '_blank')
                            : toast.info('PDF disponível após habilitar pagamentos automáticos')
                        }
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
