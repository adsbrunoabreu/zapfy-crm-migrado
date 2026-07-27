import { PageShell } from '@/components/layout/PageShell';
import { useMemo, useState } from 'react';
import { Search, MoreHorizontal, CircleDollarSign, TrendingUp, AlertCircle, CheckCircle2, Pause, RefreshCw, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useSortableData } from '@/hooks/useSortableData';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAllSubscriptions, useCancelSubscription, useRenewSubscription, useDeleteSubscription } from '@/hooks/useAllSubscriptions';
import { useToast } from '@/hooks/use-toast';
import { CompanySubscriptionDrawer } from '@/components/admin/CompanySubscriptionDrawer';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const statusMap: Record<string, { label: string; cls: string }> = {
  active: { label: 'Ativa', cls: 'bg-emerald/20 text-emerald border-emerald/30' },
  trialing: { label: 'Em teste', cls: 'bg-amber/20 text-amber border-amber/30' },
  past_due: { label: 'Atrasada', cls: 'bg-rose/20 text-rose border-rose/30' },
  canceled: { label: 'Cancelada', cls: 'bg-muted text-muted-foreground border-border' },
};

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });

export default function AdminSubscriptions() {
  const { toast } = useToast();
  const { data: subs = [], isLoading } = useAllSubscriptions();
  const cancel = useCancelSubscription();
  const renew = useRenewSubscription();
  const del = useDeleteSubscription();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [drawer, setDrawer] = useState<{ id: string; name: string } | null>(null);

  const filtered = useMemo(() => {
    return subs.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (search && !`${s.company_name} ${s.plan_name}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [subs, search, statusFilter]);

  const monthlyValue = (s: typeof subs[number]) =>
    s.billing_cycle === 'yearly' ? Number(s.monthly_price) / 12 : Number(s.monthly_price);
  const mrr = subs.filter((s) => s.status === 'active').reduce((sum, s) => sum + monthlyValue(s), 0);
  const trials = subs.filter((s) => s.status === 'trialing').length;
  const pastDue = subs.filter((s) => s.status === 'past_due').length;

  type SubSortKey = 'company' | 'plan' | 'cycle' | 'value' | 'mrr' | 'status' | 'next';
  const subAccessors = useMemo(() => ({
    company: (s: any) => (s.company_name || '').toLowerCase(),
    plan: (s: any) => (s.plan_name || '').toLowerCase(),
    cycle: (s: any) => s.billing_cycle,
    value: (s: any) => Number(s.monthly_price),
    mrr: (s: any) => monthlyValue(s),
    status: (s: any) => s.status,
    next: (s: any) => new Date(s.current_period_end),
  }), []);
  const { sorted: sortedSubs, sort: subSort, toggle: toggleSubSort } =
    useSortableData<any, SubSortKey>(filtered, subAccessors, { key: 'company', direction: 'asc' });

  const action = async (fn: () => Promise<void>, msg: string) => {
    try { await fn(); toast({ title: msg }); } catch (e: any) { toast({ title: 'Erro', description: e.message, variant: 'destructive' }); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <PageShell title="Assinaturas" subtitle="Visão consolidada de todos os contratos da plataforma">

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald/20 flex items-center justify-center"><CircleDollarSign className="w-6 h-6 text-emerald" /></div>
            <div><p className="text-2xl font-semibold text-foreground">{formatBRL(mrr)}</p><p className="text-sm text-muted-foreground">MRR</p></div>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center"><TrendingUp className="w-6 h-6 text-primary" /></div>
            <div><p className="text-2xl font-semibold">{formatBRL(mrr * 12)}</p><p className="text-sm text-muted-foreground">ARR</p></div>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber/20 flex items-center justify-center"><AlertCircle className="w-6 h-6 text-amber" /></div>
            <div><p className="text-2xl font-semibold">{trials}</p><p className="text-sm text-muted-foreground">Trials</p></div>
          </div>
        </Card>
        <Card className="stat-card">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose/20 flex items-center justify-center"><XCircle className="w-6 h-6 text-rose" /></div>
            <div><p className="text-2xl font-semibold">{pastDue}</p><p className="text-sm text-muted-foreground">Inadimplentes</p></div>
          </div>
        </Card>
      </div>

      <Card className="glass-card p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por empresa ou plano..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-secondary/50 border-border/50" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="trialing">Em teste</SelectItem>
              <SelectItem value="past_due">Atrasadas</SelectItem>
              <SelectItem value="canceled">Canceladas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border hover:bg-transparent">
              <SortableTableHead label="Empresa" sortKey="company" active={subSort.key === 'company'} direction={subSort.direction} onSort={(k) => toggleSubSort(k as SubSortKey)} />
              <SortableTableHead label="Plano" sortKey="plan" active={subSort.key === 'plan'} direction={subSort.direction} onSort={(k) => toggleSubSort(k as SubSortKey)} />
              <SortableTableHead label="Ciclo" sortKey="cycle" active={subSort.key === 'cycle'} direction={subSort.direction} onSort={(k) => toggleSubSort(k as SubSortKey)} />
              <SortableTableHead label="Valor" sortKey="value" active={subSort.key === 'value'} direction={subSort.direction} onSort={(k) => toggleSubSort(k as SubSortKey)} />
              <SortableTableHead label="MRR" sortKey="mrr" active={subSort.key === 'mrr'} direction={subSort.direction} onSort={(k) => toggleSubSort(k as SubSortKey)} />
              <SortableTableHead label="Status" sortKey="status" active={subSort.key === 'status'} direction={subSort.direction} onSort={(k) => toggleSubSort(k as SubSortKey)} />
              <SortableTableHead label="Próx. cobrança" sortKey="next" active={subSort.key === 'next'} direction={subSort.direction} onSort={(k) => toggleSubSort(k as SubSortKey)} />
              <TableHead className="w-[50px] text-xs font-medium text-muted-foreground normal-case"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border">
            {sortedSubs.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Nenhuma assinatura encontrada.</TableCell></TableRow>
            ) : sortedSubs.map((s) => {
              const st = statusMap[s.status] || statusMap.canceled;
              return (
                <TableRow key={s.id} className="border-0 hover:bg-muted/40 transition-colors">
                  <TableCell className="font-medium">{s.company_name}</TableCell>
                  <TableCell>{s.plan_name}</TableCell>
                  <TableCell><Badge variant="outline" className="border-border/50 text-xs">{s.billing_cycle === 'yearly' ? 'Anual' : 'Mensal'}</Badge></TableCell>
                  <TableCell>{formatBRL(Number(s.monthly_price))}</TableCell>
                  <TableCell className="text-emerald font-medium">{formatBRL(monthlyValue(s))}</TableCell>
                  <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(s.current_period_end), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDrawer({ id: s.company_id, name: s.company_name })}>
                          <CheckCircle2 className="w-4 h-4 mr-2" />Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => action(() => renew.mutateAsync(s.id), 'Período renovado')}>
                          <RefreshCw className="w-4 h-4 mr-2" />Renovar período
                        </DropdownMenuItem>
                        {s.status !== 'canceled' && (
                          <DropdownMenuItem onClick={() => action(() => cancel.mutateAsync(s.id), 'Assinatura cancelada')}>
                            <Pause className="w-4 h-4 mr-2" />Cancelar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive" onClick={() => action(() => del.mutateAsync(s.id), 'Assinatura removida')}>
                          <XCircle className="w-4 h-4 mr-2" />Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <CompanySubscriptionDrawer
        open={!!drawer}
        onOpenChange={(o) => !o && setDrawer(null)}
        companyId={drawer?.id || null}
        companyName={drawer?.name || ''}
      />
    </PageShell>
  );
}
