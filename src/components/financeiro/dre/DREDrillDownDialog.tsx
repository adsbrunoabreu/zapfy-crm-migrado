import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useDREDrillDown, type DreBasis } from '@/hooks/finance/useDRE';
import type { DreSection } from '@/lib/dre';
import { formatBRL } from '@/lib/finance';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  section: DreSection | null;
  label: string;
  from: Date;
  to: Date;
  basis: DreBasis;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente', paid: 'Pago', overdue: 'Vencido', canceled: 'Cancelado',
};

export function DREDrillDownDialog({ open, onOpenChange, section, label, from, to, basis }: Props) {
  const { data, isLoading } = useDREDrillDown({
    enabled: open, section, categoryId: null, from, to, basis,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Detalhamento — {label}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {format(from, 'dd/MM/yyyy', { locale: ptBR })} a {format(to, 'dd/MM/yyyy', { locale: ptBR })} · {basis === 'caixa' ? 'Caixa' : 'Competência'}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-2">{Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-10" />)}</div>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Sem lançamentos.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="text-left font-medium py-2 px-2">Descrição</th>
                  <th className="text-left font-medium py-2 px-2">Categoria</th>
                  <th className="text-left font-medium py-2 px-2">Data</th>
                  <th className="text-left font-medium py-2 px-2">Status</th>
                  <th className="text-right font-medium py-2 px-2">Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row: any) => (
                  <tr key={row.id} className="border-b border-border/20 hover:bg-secondary/30">
                    <td className="py-2 px-2">
                      <div className="font-medium">{row.description}</div>
                      {row.party_name && <div className="text-muted-foreground">{row.party_name}</div>}
                    </td>
                    <td className="py-2 px-2 text-muted-foreground">{row.category_name ?? '—'}</td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {row.paid_at ? format(new Date(row.paid_at), 'dd/MM/yyyy') : row.due_date ? format(new Date(row.due_date), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="py-2 px-2">
                      <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[row.status] ?? row.status}</Badge>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium">{formatBRL(Number(row.net_amount ?? row.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
