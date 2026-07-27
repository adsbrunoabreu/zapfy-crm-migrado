import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Search, CheckCircle2, XCircle } from 'lucide-react';
import {
  useFinancialEntries,
  useFinancialCategories,
  useMarkEntryPaid,
  useUpdateFinancialEntry,
  type FinancialEntry,
} from '@/hooks/finance/useFinancial';
import { formatBRL, STATUS_LABEL, STATUS_COLOR, computedStatus } from '@/lib/finance';
import { EntryDialog } from './EntryDialog';

interface Props { kind: 'receivable' | 'payable' }

export function EntriesTable({ kind }: Props) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [categoryId, setCategoryId] = useState<string>('');
  const [openDialog, setOpenDialog] = useState(false);

  const { data: entries = [], isLoading } = useFinancialEntries(kind, { search, status, categoryId: categoryId || null });
  const { data: cats = [] } = useFinancialCategories(kind === 'receivable' ? 'income' : 'expense');
  const markPaid = useMarkEntryPaid();
  const update = useUpdateFinancialEntry();

  const totals = useMemo(() => {
    let pending = 0, paid = 0;
    for (const e of entries) {
      if (e.status === 'paid') paid += Number(e.paid_amount);
      else if (e.status !== 'canceled') pending += Number(e.net_amount);
    }
    return { pending, paid };
  }, [entries]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar descrição..."
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="draft">Rascunho</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="partial">Parcial</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="overdue">Atrasado</SelectItem>
            <SelectItem value="canceled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryId || 'all'} onValueChange={(v) => setCategoryId(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={() => setOpenDialog(true)}>
          <Plus className="w-4 h-4 mr-1" />
          Novo
        </Button>
      </div>

      <div className="flex gap-4 text-sm">
        <div className="text-muted-foreground">
          Em aberto: <span className="text-amber font-medium tabular-nums">{formatBRL(totals.pending)}</span>
        </div>
        <div className="text-muted-foreground">
          {kind === 'receivable' ? 'Recebido' : 'Pago'}: <span className="text-emerald font-medium tabular-nums">{formatBRL(totals.paid)}</span>
        </div>
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhum lançamento encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Descrição</th>
                  <th className="text-left py-2 px-3 font-medium">Vencimento</th>
                  <th className="text-right py-2 px-3 font-medium">Valor</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                  <th className="text-right py-2 px-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => <Row key={e.id} entry={e} onMarkPaid={(id) => markPaid.mutate({ entryId: id })} onCancel={(id) => update.mutate({ id, patch: { status: 'canceled' } as any })} />)}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <EntryDialog open={openDialog} onOpenChange={setOpenDialog} kind={kind} />
    </div>
  );
}

function Row({ entry, onMarkPaid, onCancel }: {
  entry: FinancialEntry;
  onMarkPaid: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const st = computedStatus(entry);
  return (
    <tr className="border-t border-border/60 hover:bg-muted/30">
      <td className="py-2 px-3">
        <div className="font-medium">{entry.description}</div>
        {entry.party_name && <div className="text-xs text-muted-foreground">{entry.party_name}</div>}
      </td>
      <td className="py-2 px-3 text-muted-foreground">
        {entry.due_date ? new Date(entry.due_date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
      </td>
      <td className="py-2 px-3 text-right tabular-nums">
        {formatBRL(entry.net_amount)}
        {entry.discount > 0 && (
          <div className="text-xs text-muted-foreground line-through">{formatBRL(entry.amount)}</div>
        )}
      </td>
      <td className="py-2 px-3">
        <Badge className={`${STATUS_COLOR[st]} border`} variant="outline">
          {STATUS_LABEL[st]}
        </Badge>
      </td>
      <td className="py-2 px-3 text-right">
        {st !== 'paid' && st !== 'canceled' && (
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" onClick={() => onMarkPaid(entry.id)} title="Dar baixa">
              <CheckCircle2 className="w-4 h-4 text-emerald" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onCancel(entry.id)} title="Cancelar">
              <XCircle className="w-4 h-4 text-rose" />
            </Button>
          </div>
        )}
      </td>
    </tr>
  );
}
