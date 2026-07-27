import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatBRL } from '@/lib/format';
import { useReportLeads } from '@/hooks/useReportLeads';
import type { ReportFilters } from './ReportFiltersBar';
import { useState } from 'react';

interface Props { filters: ReportFilters }

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<string, string> = {
  new: 'Novo', open: 'Em aberto', in_progress: 'Em andamento',
  won: 'Ganho', lost: 'Perdido', contacted: 'Contatado',
};
const STATUS_COLOR: Record<string, string> = {
  won: 'bg-emerald/15 text-emerald border-emerald/30',
  lost: 'bg-destructive/15 text-destructive border-destructive/30',
};

export function DetailsTab({ filters }: Props) {
  const [page, setPage] = useState(0);

  const { data, isLoading } = useReportLeads({
    from: filters.range.from,
    to: filters.range.to,
    companyId: filters.companyId,
    pipelineId: filters.pipelineId,
    userId: filters.userId,
    status: filters.status,
    lossReasonId: filters.lossReasonId,
    page,
    pageSize: PAGE_SIZE,
  });

  const total = data?.total ?? 0;
  const rows = data?.rows ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Leads no período <span className="text-muted-foreground">({total.toLocaleString('pt-BR')})</span></h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} className="h-8 w-8 p-0">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">{page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-8 w-8 p-0">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum lead encontrado com os filtros atuais" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-border text-xs uppercase text-muted-foreground">
                <th className="py-2 font-medium">#</th>
                <th className="py-2 font-medium">Lead</th>
                <th className="py-2 font-medium">Pipeline / Estágio</th>
                <th className="py-2 font-medium">Responsável</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium tabular-nums text-right">Valor</th>
                <th className="py-2 font-medium">Criado</th>
                <th className="py-2 font-medium">Fechado</th>
                <th className="py-2 font-medium">Motivo perda</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="py-2.5 text-xs tabular-nums text-muted-foreground">#{String(r.numeric_id).padStart(4, '0')}</td>
                  <td className="py-2.5">
                    <span className="text-foreground">{r.name}</span>
                  </td>
                  <td className="py-2.5 text-xs">
                    <div className="flex flex-col">
                      <span className="text-foreground truncate max-w-[180px]">{r.pipeline_name ?? '—'}</span>
                      {r.stage_name && (
                        <span className="text-muted-foreground flex items-center gap-1.5 truncate max-w-[180px]">
                          {r.stage_color && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: r.stage_color }} />}
                          {r.stage_name}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 text-xs text-muted-foreground truncate max-w-[140px]">{r.assignee_name ?? '—'}</td>
                  <td className="py-2.5">
                    <Badge variant="outline" className={STATUS_COLOR[r.status] ?? 'text-muted-foreground'}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{r.value ? formatBRL(r.value) : '—'}</td>
                  <td className="py-2.5 text-xs text-muted-foreground">{format(new Date(r.created_at), 'dd/MM/yy', { locale: ptBR })}</td>
                  <td className="py-2.5 text-xs text-muted-foreground">{r.closed_at ? format(new Date(r.closed_at), 'dd/MM/yy', { locale: ptBR }) : '—'}</td>
                  <td className="py-2.5 text-xs text-muted-foreground truncate max-w-[160px]">{r.loss_reason_label ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
