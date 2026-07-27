import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateRangePicker, DEFAULT_PRESETS } from '@/components/ui/date-range-picker';
import {
  Wallet, Scale, TrendingUp, TrendingDown,
  Search, Download, ArrowUp, ArrowDown, ChevronsUpDown, CheckCircle2, Paperclip, FileText, Trash2,
} from 'lucide-react';
import { TableRowSkeleton } from '@/components/ui/table-row-skeleton';
import {
  useBudgetOverview, useLeadBudgets,
  type BudgetOrderBy, type OrderDir, type BudgetRow,
} from '@/hooks/finance/useBudgets';
import { useDeleteLead } from '@/hooks/useLeads';
import { usePipelines } from '@/hooks/usePipelines';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { formatBRL } from '@/lib/finance';
import { KpiDeltaCard } from './KpiDeltaCard';
import { DiscountDialog } from './DiscountDialog';
import { BudgetDetailDrawer } from './BudgetDetailDrawer';
import { LeadDeleteDialog } from '@/pages/leads/LeadDeleteDialogs';
import { format, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

export type BudgetsFilters = {
  from: Date;
  to: Date;
  presetKey?: string;
  pipelineId: string;
  ownerId: string;
};

export function getDefaultBudgetsFilters(): BudgetsFilters {
  const today = new Date();
  return { from: subDays(today, 29), to: today, presetKey: 'last30', pipelineId: 'all', ownerId: 'all' };
}

export function BudgetsFiltersBar({
  value,
  onChange,
}: {
  value: BudgetsFilters;
  onChange: (v: BudgetsFilters) => void;
}) {
  const { data: pipelines = [] } = usePipelines();
  const { data: members = [] } = useTeamMembers();
  return (
    <div className="flex items-center gap-2 flex-wrap lg:flex-nowrap">
      <Select value={value.pipelineId} onValueChange={(v) => onChange({ ...value, pipelineId: v })}>
        <SelectTrigger className="h-9 w-[180px] bg-secondary/50 border-border/50 text-xs">
          <SelectValue placeholder="Pipeline" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os pipelines</SelectItem>
          {pipelines.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={value.ownerId} onValueChange={(v) => onChange({ ...value, ownerId: v })}>
        <SelectTrigger className="h-9 w-[180px] bg-secondary/50 border-border/50 text-xs">
          <SelectValue placeholder="Responsável" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os responsáveis</SelectItem>
          {members.map((m: any) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.name ?? m.email}</SelectItem>)}
        </SelectContent>
      </Select>
      <DateRangePicker
        value={{ from: value.from, to: value.to }}
        activePresetKey={value.presetKey}
        presets={DEFAULT_PRESETS}
        align="end"
        className="bg-secondary/50 border-border/50 h-9 text-xs"
        onChange={(range, key) => {
          if (range?.from && range?.to) {
            onChange({ ...value, from: range.from, to: range.to, presetKey: key });
          } else {
            onChange({ ...value, presetKey: key });
          }
        }}
      />
    </div>
  );
}

export function BudgetsPanel({ filters: extFilters }: { filters?: BudgetsFilters } = {}) {
  const fallback = useMemo(() => getDefaultBudgetsFilters(), []);
  const f = extFilters ?? fallback;

  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [orderBy, setOrderBy] = useState<BudgetOrderBy>('created_at');
  const [orderDir, setOrderDir] = useState<OrderDir>('desc');
  const [page, setPage] = useState(0);
  const [discountLead, setDiscountLead] = useState<{ id: string; name: string; value: number; pct: number | null; amount: number | null } | null>(null);
  const [detailRow, setDetailRow] = useState<BudgetRow | null>(null);
  const [deleteRow, setDeleteRow] = useState<BudgetRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const deleteLead = useDeleteLead();

  const filters = {
    periodStart: format(f.from, 'yyyy-MM-dd'),
    periodEnd: format(f.to, 'yyyy-MM-dd'),
    pipelineId: f.pipelineId === 'all' ? null : f.pipelineId,
    assignedTo: f.ownerId === 'all' ? null : f.ownerId,
    search: search || null,
    status: statusFilter === 'all' ? null : statusFilter,
    orderBy, orderDir,
  };

  const { data: overview } = useBudgetOverview(filters);
  const { data: list, isLoading: listLoading } = useLeadBudgets(filters, page, 50);

  const EMPTY_KPI = { total_value: 0, won_value: 0, lost_value: 0, open_value: 0, count_total: 0, count_won: 0, count_lost: 0, count_open: 0, avg_ticket: 0, projection: 0, gross_revenue: 0, discount_total: 0 };
  const cur = overview?.current ?? EMPTY_KPI;
  const prev = overview?.previous ?? EMPTY_KPI;

  const toggleSort = (col: BudgetOrderBy) => {
    if (orderBy === col) setOrderDir(orderDir === 'asc' ? 'desc' : 'asc');
    else { setOrderBy(col); setOrderDir('desc'); }
    setPage(0);
  };

  const SortHeader = ({ col, children, className }: { col: BudgetOrderBy; children: React.ReactNode; className?: string }) => {
    const active = orderBy === col;
    return (
      <th
        className={cn('text-left py-2 px-3 font-medium select-none cursor-pointer hover:text-foreground transition-colors', className)}
        onClick={() => toggleSort(col)}
        aria-sort={active ? (orderDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <span className="inline-flex items-center gap-1">
          {children}
          {active ? (
            orderDir === 'asc'
              ? <ArrowUp className="w-3 h-3 text-foreground" />
              : <ArrowDown className="w-3 h-3 text-foreground" />
          ) : (
            <ChevronsUpDown className="w-3 h-3 opacity-40" />
          )}
        </span>
      </th>
    );
  };

  const exportCSV = () => {
    if (!list?.items?.length) return;
    const headers = ['ID', 'Nome', 'Pipeline', 'Etapa', 'Valor', 'Desconto', 'Líquido', 'Pagamento', 'Parcelas', 'Pago em', 'NF', 'Responsável', 'Criado em'];
    const rows = list.items.map((r) => [
      r.tenant_seq != null ? `#${String(r.tenant_seq).padStart(4, '0')}` : `#${r.numeric_id}`, r.name, r.pipeline_name ?? '', r.stage_name ?? '',
      r.value ?? 0,
      r.discount_amount ?? (r.value && r.discount_pct ? (Number(r.value) * Number(r.discount_pct) / 100) : 0),
      r.net_value ?? 0, r.payment_method ?? '', r.payment_installments ?? 1,
      r.payment_confirmed_at ? format(new Date(r.payment_confirmed_at), 'dd/MM/yyyy') : '',
      r.invoice_number ?? '',
      r.assigned_to_name ?? '', format(new Date(r.created_at), 'dd/MM/yyyy'),
    ]);
    const csv = [headers, ...rows].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orcamentos_${filters.periodStart}_${filters.periodEnd}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* KPIs — sempre renderizados; sem spinner em tela cheia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiDeltaCard label="Total de orçamentos" value={formatBRL(cur.total_value)} icon={<Wallet className="w-4 h-4" />} hint={`${cur.count_total} fichas`} />
        <KpiDeltaCard label="Total em negociação" value={formatBRL(cur.open_value)} tone="info" icon={<Scale className="w-4 h-4" />} hint={`${cur.count_open} fichas`} />
        <KpiDeltaCard label="Total realizado" value={formatBRL(cur.won_value)} current={cur.won_value} previous={prev.won_value} tone="success" icon={<TrendingUp className="w-4 h-4" />} hint={`${cur.count_won} fichas`} />
        <KpiDeltaCard label="Total perdido" value={formatBRL(cur.lost_value)} current={cur.lost_value} previous={prev.lost_value} tone="danger" icon={<TrendingDown className="w-4 h-4" />} hint={`${cur.count_lost} fichas`} />
      </div>

      {/* Busca + Status + CSV */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Buscar por nome ou #ID..."
            className="pl-8 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="h-9 w-[160px] bg-secondary/50 border-border/50 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="won">Apenas Ganhos</SelectItem>
            <SelectItem value="lost">Apenas Perdidos</SelectItem>
            <SelectItem value="new">Em aberto</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9" onClick={exportCSV}>
          <Download className="w-4 h-4 mr-1" />CSV
        </Button>
      </div>

      {/* Lista */}
      <Card className="overflow-hidden">
        {listLoading && !list ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                <TableRowSkeleton columns={11} rows={5} />
              </tbody>
            </table>
          </div>
        ) : !list?.items?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhuma ficha encontrada no período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <SortHeader col="numeric_id">ID</SortHeader>
                  <SortHeader col="name">Nome</SortHeader>
                  <SortHeader col="created_at">Data</SortHeader>
                  <SortHeader col="pipeline_name">Pipeline</SortHeader>
                  <SortHeader col="stage_name">Etapa</SortHeader>
                  <SortHeader col="value">Valor</SortHeader>
                  <SortHeader col="net_value">Líquido</SortHeader>
                  <SortHeader col="payment_method">Pagamento</SortHeader>
                  <SortHeader col="invoice_number">NF</SortHeader>
                  <SortHeader col="payment_confirmed_at">Confirmado</SortHeader>
                  <SortHeader col="payment_confirmed_at">Pago em</SortHeader>
                  <SortHeader col="assigned_to_name">Responsável</SortHeader>
                  <th className="text-right py-2 px-3 font-medium w-12">Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((r) => {
                  const paid = !!r.payment_confirmed_at;
                  const methodLabel = r.payment_method
                    ? r.payment_method === 'Cartão de Crédito' && (r.payment_installments ?? 1) > 1
                      ? `Cartão ${r.payment_installments}x`
                      : r.payment_method
                    : null;
                  const isWon = r.stage_type === 'won';
                  const displayId = r.tenant_seq != null
                    ? `#${String(r.tenant_seq).padStart(4, '0')}`
                    : `#${r.numeric_id}`;
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-border/60 cursor-pointer ${
                        isWon
                          ? 'bg-emerald/10 hover:bg-emerald/15 border-l-2 border-l-emerald/60'
                          : 'hover:bg-muted/30'
                      }`}
                      onClick={(e) => {
                        const target = e.target as HTMLElement;
                        if (target.closest('button,select,input,[role="combobox"],[data-stop]')) return;
                        setDetailRow(r);
                      }}
                    >
                      <td className="text-left py-2 px-3 tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                        {displayId}
                      </td>
                      <td className="text-left py-2 px-3">
                        <div className="font-medium">{r.name}</div>
                      </td>
                      <td className="text-left py-2 px-3 text-xs text-muted-foreground tabular-nums">{format(new Date(r.created_at), 'dd/MM/yyyy')}</td>
                      <td className="text-left py-2 px-3 text-xs text-muted-foreground">{r.pipeline_name ?? '—'}</td>
                      <td className="text-left py-2 px-3 text-xs text-foreground">
                        {r.stage_name ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="text-left py-2 px-3 tabular-nums">{formatBRL(r.value ?? 0)}</td>
                      <td className="text-left py-2 px-3 tabular-nums font-medium">{formatBRL(r.net_value ?? 0)}</td>
                      <td className="text-left py-2 px-3">
                        {paid && methodLabel ? (
                          <span className="text-xs text-foreground">{methodLabel}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-left py-2 px-3">
                        {r.invoice_number ? (
                          <span className="inline-flex items-center gap-1 text-xs text-foreground">
                            <FileText className="w-3 h-3 text-muted-foreground" />
                            {r.invoice_number}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-left py-2 px-3">
                        <div className="flex items-center gap-2">
                          <Button
                            data-stop
                            size="sm"
                            className={`h-8 px-3 text-xs font-medium gap-1.5 ${
                              paid
                                ? 'bg-emerald hover:bg-emerald/90 text-white border-0'
                                : ''
                            }`}
                            variant={paid ? 'default' : 'default'}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailRow(r);
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {paid ? 'Pago' : 'Confirmar'}
                          </Button>
                          {r.attachments_count > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <Paperclip className="w-3 h-3" />{r.attachments_count}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-left py-2 px-3 text-xs text-muted-foreground tabular-nums">
                        {paid ? format(new Date(r.payment_confirmed_at!), 'dd/MM/yyyy') : '—'}
                      </td>
                      <td className="text-left py-2 px-3 text-xs text-muted-foreground">{r.assigned_to_name ?? '—'}</td>
                      <td className="text-right py-2 px-3">
                        <Button
                          data-stop
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Excluir orçamento"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteRow(r);
                            setDeleteConfirm('');
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {list && list.total > 50 && (
          <div className="flex items-center justify-between px-3 py-2 border-t border-border/60 text-xs">
            <span className="text-muted-foreground">
              {page * 50 + 1}–{Math.min((page + 1) * 50, list.total)} de {list.total}
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button size="sm" variant="outline" disabled={(page + 1) * 50 >= list.total} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>

      <DiscountDialog lead={discountLead} onOpenChange={(open) => !open && setDiscountLead(null)} />
      <BudgetDetailDrawer row={detailRow} onOpenChange={(open) => !open && setDetailRow(null)} />
      <LeadDeleteDialog
        open={!!deleteRow}
        onOpenChange={(o) => { if (!o) { setDeleteRow(null); setDeleteConfirm(''); } }}
        leadName={deleteRow?.name}
        confirmation={deleteConfirm}
        setConfirmation={setDeleteConfirm}
        isPending={deleteLead.isPending}
        onConfirm={() => {
          if (!deleteRow) return;
          deleteLead.mutate(deleteRow.id, {
            onSuccess: () => { setDeleteRow(null); setDeleteConfirm(''); },
          });
        }}
      />
    </div>
  );
}
