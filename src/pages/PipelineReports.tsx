import { PageShell } from '@/components/layout/PageShell';
import { useMemo, useState } from 'react';
// date-fns helpers no longer needed for presets (centralized in DEFAULT_PRESETS)
import { useAuth } from '@/contexts/AuthContext';
import { usePipelinePerformance, type ReportStatusFilter } from '@/hooks/usePipelinePerformance';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useReportsRealtime } from '@/hooks/useReportsRealtime';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DEFAULT_PRESETS, type DateRange } from '@/components/ui/date-range-picker';
import { parsePersistedAppDateRange, serializeAppDateRange } from '@/lib/appDate';
import { toast } from 'sonner';
import { Download, RefreshCw } from 'lucide-react';
import { ReportFiltersBar, type ReportFilters } from '@/components/reports/ReportFiltersBar';
import { ReportKpiHeader } from '@/components/reports/ReportKpiHeader';
import { OverviewTab } from '@/components/reports/OverviewTab';
import { PipelinesTab } from '@/components/reports/PipelinesTab';
import { TeamTab } from '@/components/reports/TeamTab';
import { LossReasonsTab } from '@/components/reports/LossReasonsTab';
import { DetailsTab } from '@/components/reports/DetailsTab';
import { CrossInsightsTab } from '@/components/reports/CrossInsightsTab';
import { ReportTypeSwitcher } from '@/components/reports/ReportTypeSwitcher';

type PeriodKey = 'today' | 'yesterday' | '7d' | '15d' | '30d' | '60d' | '90d' | 'mtd' | 'ytd' | 'custom';

interface PersistedRange { from: string; to: string }

function resolveRange(period: PeriodKey, custom?: DateRange): DateRange {
  if (period === 'custom' && custom) return custom;
  const p = DEFAULT_PRESETS.find(x => x.key === period);
  return p ? p.getRange() : (DEFAULT_PRESETS.find(x => x.key === '30d')!.getRange());
}

export default function PipelineReports() {
  const { isMaster, profile } = useAuth();

  const [period, setPeriod] = usePersistedState<PeriodKey>('pipelineReports.period', '30d');
  const [persistedRange, setPersistedRange] = usePersistedState<PersistedRange | null>('pipelineReports.customRange', null);
  const [companyId, setCompanyId] = usePersistedState<string | undefined>('pipelineReports.companyId', undefined);
  const [pipelineId, setPipelineId] = usePersistedState<string | undefined>('pipelineReports.pipelineId', undefined);
  const [userId, setUserId] = usePersistedState<string | undefined>('pipelineReports.userId', undefined);
  const [status, setStatus] = usePersistedState<ReportStatusFilter>('pipelineReports.status', 'all');
  const [lossReasonId, setLossReasonId] = usePersistedState<string | undefined>('pipelineReports.lossReasonId', undefined);
  const [tab, setTab] = useState<string>('overview');

  const customRange = useMemo<DateRange | undefined>(() => {
    const parsed = parsePersistedAppDateRange(persistedRange ?? undefined);
    return parsed ? { from: parsed.from, to: parsed.to } : undefined;
  }, [persistedRange]);

  const range = useMemo(() => resolveRange(period, customRange), [period, customRange]);

  const prevRange = useMemo(() => {
    const ms = range.to.getTime() - range.from.getTime();
    const to = new Date(range.from.getTime() - 1);
    const from = new Date(to.getTime() - ms);
    return { from, to };
  }, [range]);

  const filters: ReportFilters = {
    period, range, customRange, companyId, pipelineId, userId, status, lossReasonId,
  };

  const { data, isLoading, isFetching, error, refetch } = usePipelinePerformance({
    from: range.from, to: range.to,
    companyId, pipelineId, userId, status, lossReasonId,
  });

  const { data: prevData } = usePipelinePerformance({
    from: prevRange.from, to: prevRange.to,
    companyId, pipelineId, userId, status, lossReasonId,
  });

  useReportsRealtime(companyId ?? profile?.company_id ?? undefined);

  const handleFilterChange = (next: Partial<ReportFilters>) => {
    if ('companyId' in next) setCompanyId(next.companyId);
    if ('pipelineId' in next) setPipelineId(next.pipelineId);
    if ('userId' in next) setUserId(next.userId);
    if ('status' in next && next.status) setStatus(next.status);
    if ('lossReasonId' in next) setLossReasonId(next.lossReasonId);
  };

  const handleRangeChange = (r: DateRange, key?: string) => {
    if (key && key !== 'custom') {
      setPeriod(key as PeriodKey);
      setPersistedRange(null);
    } else {
      setPeriod('custom');
      setPersistedRange(serializeAppDateRange(r));
    }
  };

  const handleExportCsv = () => {
    if (!data) return;
    const escape = (v: unknown) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",;\n\r]/.test(s) ? `"${s}"` : s;
    };
    const k = data.kpis;
    const sections: { title: string; headers: string[]; rows: (string | number | null)[][] }[] = [
      {
        title: 'KPIs',
        headers: ['Métrica', 'Valor'],
        rows: [
          ['Leads', k?.total_leads ?? 0],
          ['Ganhos', k?.won ?? 0],
          ['Perdidos', k?.lost ?? 0],
          ['Reaberturas', k?.reopened ?? 0],
          ['Receita ganha', k?.revenue_won ?? 0],
          ['Receita perdida', k?.revenue_lost ?? 0],
          ['Ticket médio (ganho)', k?.avg_ticket_won ?? ''],
          ['Ciclo médio (dias)', k?.avg_cycle_days ?? ''],
          ['Tempo de resposta (h)', k?.avg_response_hours ?? ''],
        ],
      },
      {
        title: 'Por pipeline',
        headers: ['Pipeline', 'Leads', 'Ganhos', 'Perdidos', 'Receita', 'Ciclo médio (d)'],
        rows: (data.by_pipeline ?? []).map(p => [p.name, p.leads, p.won, p.lost, p.revenue, p.avg_cycle_days]),
      },
      {
        title: 'Por responsável',
        headers: ['Responsável', 'Leads', 'Ganhos', 'Perdidos', 'Win rate %', 'Ticket médio', 'Tempo resposta (h)', 'Receita'],
        rows: (data.by_user ?? []).map(u => {
          const closed = u.won + u.lost;
          const wr = closed > 0 ? Math.round((u.won / closed) * 100) : 0;
          return [u.name, u.leads, u.won, u.lost, wr, u.avg_ticket, u.avg_response_hours, u.revenue];
        }),
      },
      {
        title: 'Motivos de perda',
        headers: ['Motivo', 'Quantidade', '%', 'Valor potencial', 'Ticket médio'],
        rows: (data.by_loss_reason ?? []).map(r => [r.label, r.cnt, r.pct, r.value_sum, r.avg_value]),
      },
      {
        title: 'Estágios',
        headers: ['Estágio', 'Tipo', 'Atual', 'Entradas', 'Saídas', 'Tempo médio (h)'],
        rows: (data.stages ?? []).map(s => [s.name, s.stage_type, s.current_count, s.entries, s.exits, s.avg_hours_in_stage]),
      },
    ];

    const lines: string[] = [];
    sections.forEach((sec, i) => {
      if (i > 0) lines.push('');
      lines.push(`# ${sec.title}`);
      lines.push(sec.headers.join(';'));
      sec.rows.forEach(r => lines.push(r.map(escape).join(';')));
    });

    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Relatório exportado em CSV');
  };

  const handleClearFilters = () => {
    setCompanyId(undefined);
    setPipelineId(undefined);
    setUserId(undefined);
    setStatus('all');
    setLossReasonId(undefined);
  };

  const exportButton = (
    <>
      <ReportTypeSwitcher active="pipelines" />
      <Button
        type="button" variant="outline"
        className="h-9 bg-secondary/50 border-border/50 text-xs gap-2"
        onClick={() => refetch()} disabled={isFetching}
        title="Atualizar dados"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        Atualizar
      </Button>
      <Button
        type="button" variant="outline"
        className="h-9 bg-secondary/50 border-border/50 text-xs gap-2"
        onClick={handleExportCsv} disabled={!data}
      >
        <Download className="w-3.5 h-3.5" />
        Exportar CSV
      </Button>
    </>
  );

  return (
    <PageShell
      title="Relatórios de Pipeline"
      subtitle={`Métricas de pipelines, equipe e motivos de perda no período selecionado.${isFetching && !isLoading ? ' · atualizando…' : ''}`}
      actions={
        <ReportFiltersBar
          filters={filters}
          presets={DEFAULT_PRESETS}
          onChange={handleFilterChange}
          onRangeChange={handleRangeChange}
          onClear={handleClearFilters}
          extraAction={exportButton}
        />
      }
    >


      {error && (
        <Card className="p-6 border-destructive/50">
          <p className="text-sm text-destructive">Erro ao carregar relatórios: {(error as Error).message}</p>
        </Card>
      )}

      {isLoading && !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : (
        <>
          <ReportKpiHeader kpis={data?.kpis} prevKpis={prevData?.kpis} />

          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full">
              <TabsTrigger value="overview" className="text-xs">Visão geral</TabsTrigger>
              <TabsTrigger value="pipelines" className="text-xs">Pipelines</TabsTrigger>
              <TabsTrigger value="team" className="text-xs">Equipe</TabsTrigger>
              <TabsTrigger value="loss" className="text-xs">Motivos</TabsTrigger>
              <TabsTrigger value="cross" className="text-xs">Cruzamentos</TabsTrigger>
              <TabsTrigger value="details" className="text-xs">Detalhes</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4">
              <OverviewTab
                daily={data?.daily ?? []}
                prevDaily={prevData?.daily ?? []}
                stages={data?.stages ?? []}
                kpis={data?.kpis}
              />
            </TabsContent>

            <TabsContent value="pipelines" className="mt-4">
              <PipelinesTab
                rows={data?.by_pipeline ?? []}
                prevRows={prevData?.by_pipeline ?? []}
                stages={data?.stages ?? []}
              />
            </TabsContent>

            <TabsContent value="team" className="mt-4">
              <TeamTab rows={data?.by_user ?? []} />
            </TabsContent>

            <TabsContent value="loss" className="mt-4">
              <LossReasonsTab
                rows={data?.by_loss_reason ?? []}
                daily={data?.loss_reason_daily ?? []}
              />
            </TabsContent>

            <TabsContent value="cross" className="mt-4">
              <CrossInsightsTab
                byPipeline={data?.by_pipeline ?? []}
                byUser={data?.by_user ?? []}
                byLossReason={data?.by_loss_reason ?? []}
                stages={data?.stages ?? []}
              />
            </TabsContent>

            <TabsContent value="details" className="mt-4">
              <DetailsTab filters={filters} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </PageShell>
  );
}
