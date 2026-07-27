import { PageShell } from '@/components/layout/PageShell';
import { useEffect, useMemo, useCallback } from 'react';
import { Users, DollarSign, TrendingUp, Banknote, Clock, Download, Wallet, Trophy, GitBranch, AlertTriangle, UserCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCompany } from '@/hooks/useCompanies';
import { useDashboardData, getRangeForPeriod, type DashboardPeriod } from '@/hooks/useDashboardData';
import { DashboardSkeleton } from '@/components/skeletons/PageSkeletons';
import { DateRangeFilter } from '@/components/dashboard/DateRangeFilter';
import { StatCard } from '@/components/dashboard/StatCard';
import { StageChart } from '@/components/dashboard/StageChart';
import { OutcomesFunnel } from '@/components/dashboard/OutcomesFunnel';
import { PipelineValueCard } from '@/components/dashboard/PipelineValueCard';
import { TeamPerformanceTable } from '@/components/dashboard/TeamPerformanceTable';
import { CompanyCrossInsights } from '@/components/dashboard/CompanyCrossInsights';
import { WonLostKpiRow } from '@/components/dashboard/WonLostKpiRow';
import { LossReasonsCard } from '@/components/dashboard/LossReasonsCard';
import { ClosingsEvolutionChart } from '@/components/dashboard/ClosingsEvolutionChart';
import { Button } from '@/components/ui/button';
import { usePersistedState } from '@/hooks/usePersistedState';
import { parsePersistedAppDateRange, serializeAppDateRange } from '@/lib/appDate';
import { usePipelines } from '@/hooks/usePipelines';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { FilterPopoverButton } from '@/components/filters/FilterPopoverButton';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { OnboardingProgressCard } from '@/components/onboarding/OnboardingProgressCard';
import { UsageLimitsCard } from '@/components/subscription/UsageLimitsCard';
import { useCompanySubscription } from '@/hooks/useSubscriptions';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { formatBRL, formatPeriodLabel } from '@/lib/format';
import { downloadCsvSections } from '@/lib/exportDashboardCsv';
import { useReportsRealtime } from '@/hooks/useReportsRealtime';

const PERIOD_KEY = 'companyDashboard.period';
const CUSTOM_RANGE_KEY = 'companyDashboard.customRange';
const PIPELINE_KEY = 'companyDashboard.pipelineId';

interface PersistedRange { from: string; to: string }

export default function CompanyDashboard() {
  const { profile } = useAuth();
  const { data: company } = useUserCompany();
  useReportsRealtime(profile?.company_id ?? undefined);

  const [period, setPeriod] = usePersistedState<DashboardPeriod>(PERIOD_KEY, '7d');
  const [persistedRange, setPersistedRange] = usePersistedState<PersistedRange | null>(CUSTOM_RANGE_KEY, null);
  const [pipelineId, setPipelineId] = usePersistedState<string | null>(PIPELINE_KEY, null);
  const { data: pipelines = [] } = usePipelines();
  const { data: subscription } = useCompanySubscription(profile?.company_id || undefined);
  const { data: plans } = useSubscriptionPlans();
  const currentPlan = useMemo(
    () => (plans || []).find((p) => p.id === subscription?.plan_id) || null,
    [plans, subscription],
  );
  

  const customRange = useMemo(() => {
    const parsed = parsePersistedAppDateRange(persistedRange ?? undefined);
    return parsed ? { from: parsed.from, to: parsed.to } : undefined;
  }, [persistedRange]);

  const range = useMemo(() => getRangeForPeriod(period, customRange), [period, customRange]);
  const { data, isLoading, error, isFetching } = useDashboardData(range, pipelineId || undefined);

  useEffect(() => {
    if (error) toast.error('Erro ao carregar dashboard', { description: (error as Error).message });
  }, [error]);

  const handleRangeChange = (p: DashboardPeriod, c?: { from: Date; to: Date }) => {
    setPeriod(p);
    if (c) setPersistedRange(serializeAppDateRange(c));
    else setPersistedRange(null);
  };

  const handleExportCsv = useCallback(() => {
    if (!data) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsvSections(`dashboard_empresa_${stamp}.csv`, [
      {
        title: 'KPIs',
        headers: ['Métrica', 'Atual', 'Anterior'],
        rows: [
          ['Oportunidades', data.totalLeads.current, data.totalLeads.previous],
          ['Valor em Pipeline (R$)', data.pipelineValue.current.toFixed(2), data.pipelineValue.previous.toFixed(2)],
          ['Taxa de Conversão (%)', data.conversionRate.current.toFixed(2), data.conversionRate.previous.toFixed(2)],
          ['Win Rate (%)', data.winRate.current.toFixed(2), data.winRate.previous.toFixed(2)],
          ['Ticket Médio (R$)', data.avgWonTicket.current.toFixed(2), data.avgWonTicket.previous.toFixed(2)],
          ['Ciclo de Venda (dias)', data.avgCycleDays.current.toFixed(2), data.avgCycleDays.previous.toFixed(2)],
          ['Conversão entre Etapas (%)', data.stageConversionAvg.current.toFixed(2), data.stageConversionAvg.previous.toFixed(2)],
          ['Estagnados (>14d)', data.stagnantLeads.current, data.stagnantLeads.previous],
          ['Receita Realizada (R$)', data.wonRevenue.current.toFixed(2), data.wonRevenue.previous.toFixed(2)],
          ['Produtividade (ganhos/atendente)', data.salesProductivity.current.toFixed(2), data.salesProductivity.previous.toFixed(2)],
          ['Receita Total (R$)', data.revenue.current.toFixed(2), data.revenue.previous.toFixed(2)],
          ['Ticket Médio Geral (R$)', data.avgTicket.current.toFixed(2), data.avgTicket.previous.toFixed(2)],
          ['Mensagens Enviadas', data.messages.current, data.messages.previous],
          ['Tempo Médio Resposta (h)', data.avgResponseHours.current.toFixed(2), data.avgResponseHours.previous.toFixed(2)],
        ],
      },
      {
        title: 'Evolução de Leads',
        headers: ['Bucket', 'Leads'],
        rows: data.evolution.map((e) => [e.label, e.count]),
      },
      {
        title: 'Estágios',
        headers: ['Status', 'Estágio', 'Leads', 'Valor (R$)'],
        rows: data.stages.map((s) => [s.status, s.label, s.count, s.total_value.toFixed(2)]),
      },
      {
        title: 'Equipe',
        headers: ['Membro', 'Atribuídos', 'Convertidos', 'Conversão (%)', 'Ganhos (fechados)', 'Perdidos', 'Win Rate (%)', 'Ciclo médio (dias)', 'Receita ganha (R$)', 'Ticket Médio (R$)'],
        rows: data.team.map((m) => [m.name, m.total_leads, m.converted, m.conversion_rate.toFixed(2), m.closed_won, m.closed_lost, m.win_rate_closed.toFixed(2), m.avg_cycle_days.toFixed(2), m.won_revenue.toFixed(2), m.avg_ticket.toFixed(2)]),
      },
      {
        title: 'Fechamentos por Dia',
        headers: ['Bucket', 'Ganhos', 'Perdidos'],
        rows: data.evolution.map((e) => [e.label, e.closedWon, e.closedLost]),
      },
      {
        title: 'Motivos de Perda',
        headers: ['Motivo', 'Quantidade', '%', 'Valor (R$)'],
        rows: data.lossReasons.map((r) => [r.label, r.count, r.percentage.toFixed(2), r.total_value.toFixed(2)]),
      },
    ]);
    toast.success('Dashboard exportado em CSV');
  }, [data]);

  if (isLoading && !data) return <DashboardSkeleton />;

  const fmtHours = (h: number) => (h >= 1 ? `${h.toFixed(1)}h` : `${Math.round(h * 60)}min`);
  const periodLabel = formatPeriodLabel(period, customRange);

  return (
    <PageShell
      title={`Painel da Empresa${company?.name ? ` · ${company.name}` : ''}`}
      subtitle={`Olá, ${profile?.full_name?.split(' ')[0] || 'Administrador'} · ${periodLabel}${isFetching && !isLoading ? ' · atualizando…' : ''}`}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            className="h-9 bg-secondary/50 border-border/50 text-xs gap-2"
            onClick={handleExportCsv}
            disabled={!data}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </Button>

          <FilterPopoverButton
            activeCount={pipelineId ? 1 : 0}
            onClear={() => setPipelineId(null)}
          >
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Pipeline</Label>
              <FilterSelect
                value={pipelineId || 'all'}
                onValueChange={(v) => setPipelineId(v === 'all' ? null : v)}
                options={[
                  { value: 'all', label: 'Todos os pipelines' },
                  ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                ]}
                placeholder="Pipeline"
                width="w-full"
              />
            </div>
          </FilterPopoverButton>

          <DateRangeFilter
            period={period}
            customRange={customRange}
            onChange={handleRangeChange}
          />
        </>
      }
    >

      {/* KPIs - 10 cards principais */}
      <OnboardingProgressCard />

      {data?.truncated && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Mostrando os 5.000 leads mais recentes do período. Use um intervalo menor para ver todos.
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Oportunidades"
          value={(data?.totalLeads.current ?? 0).toLocaleString('pt-BR')}
          rawValue={data?.totalLeads.current ?? 0}
          countUp
          current={data?.totalLeads.current ?? 0}
          previous={data?.totalLeads.previous ?? 0}
          icon={Users}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          hint={{
            title: 'Oportunidades',
            definition: 'Oportunidades criadas na empresa dentro do período selecionado.',
            formula: 'COUNT(leads WHERE created_at BETWEEN período)',
          }}
        />
        <StatCard
          label="Valor em Pipeline"
          value={formatBRL(data?.pipelineValue.current ?? 0, { fraction: true })}
          current={data?.pipelineValue.current ?? 0}
          previous={data?.pipelineValue.previous ?? 0}
          icon={Wallet}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          hint={{
            title: 'Valor Total em Pipeline',
            definition: 'Soma de R$ das oportunidades em estágios abertos do funil.',
            formula: 'Σ value WHERE stage_type = open',
          }}
        />
        <StatCard
          label="Taxa de Conversão"
          value={`${(data?.conversionRate.current ?? 0).toFixed(1)}%`}
          current={data?.conversionRate.current ?? 0}
          previous={data?.conversionRate.previous ?? 0}
          deltaUnit="pp"
          icon={TrendingUp}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          hint={{
            title: 'Taxa de Conversão Geral',
            definition: '% de leads do período que viraram ganhos.',
            formula: 'won / total × 100',
            note: 'Variação em pontos percentuais (pp).',
          }}
        />
        <StatCard
          label="Win Rate"
          value={`${(data?.winRate.current ?? 0).toFixed(1)}%`}
          current={data?.winRate.current ?? 0}
          previous={data?.winRate.previous ?? 0}
          deltaUnit="pp"
          icon={Trophy}
          iconColor="text-[hsl(var(--emerald))]"
          iconBg="bg-[hsl(var(--emerald))]/10"
          hint={{
            title: 'Win Rate',
            definition: 'Relação entre ganhos e fechamentos (ganhos + perdidos) no período.',
            formula: 'won / (won + lost) × 100',
          }}
        />
        <StatCard
          label="Ticket Médio"
          value={formatBRL(data?.avgWonTicket.current ?? 0, { fraction: true })}
          current={data?.avgWonTicket.current ?? 0}
          previous={data?.avgWonTicket.previous ?? 0}
          icon={Banknote}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          hint={{
            title: 'Ticket Médio',
            definition: 'Valor médio dos leads ganhos no período.',
            formula: 'won_revenue / won_count',
          }}
        />
        <StatCard
          label="Ciclo de Venda"
          value={`${(data?.avgCycleDays.current ?? 0).toFixed(1)}d`}
          current={data?.avgCycleDays.current ?? 0}
          previous={data?.avgCycleDays.previous ?? 0}
          invertDelta
          icon={Clock}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          hint={{
            title: 'Ciclo de Venda',
            definition: 'Tempo médio entre a criação da oportunidade e o fechamento ganho.',
            formula: 'AVG(closed_at − created_at) dos ganhos',
            note: 'Quanto menor, melhor — variação invertida.',
          }}
        />
        <StatCard
          label="Conv. entre Etapas"
          value={`${(data?.stageConversionAvg.current ?? 0).toFixed(1)}%`}
          current={data?.stageConversionAvg.current ?? 0}
          previous={data?.stageConversionAvg.previous ?? 0}
          deltaUnit="pp"
          icon={GitBranch}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          hint={{
            title: 'Taxa de Conversão por Etapa',
            definition: 'Média das taxas de passagem entre etapas abertas consecutivas do funil.',
            formula: 'AVG(count[i+1] / count[i]) para etapas open',
            note: 'Identifica gargalos no funil.',
          }}
        />
        <StatCard
          label="Estagnados"
          value={(data?.stagnantLeads.current ?? 0).toLocaleString('pt-BR')}
          rawValue={data?.stagnantLeads.current ?? 0}
          countUp
          current={data?.stagnantLeads.current ?? 0}
          previous={data?.stagnantLeads.previous ?? 0}
          invertDelta
          icon={AlertTriangle}
          iconColor="text-[hsl(var(--amber))]"
          iconBg="bg-[hsl(var(--amber))]/10"
          hint={{
            title: 'Estagnados',
            definition: 'Oportunidades abertas sem atualização há mais de 14 dias.',
            formula: 'COUNT(leads abertos WHERE updated_at < hoje − 14d)',
            note: 'Quanto menor, melhor — variação invertida.',
          }}
        />
        <StatCard
          label="Receita Realizada"
          value={formatBRL(data?.wonRevenue.current ?? 0, { fraction: true })}
          current={data?.wonRevenue.current ?? 0}
          previous={data?.wonRevenue.previous ?? 0}
          icon={DollarSign}
          iconColor="text-[hsl(var(--emerald))]"
          iconBg="bg-[hsl(var(--emerald))]/10"
          hint={{
            title: 'Receita Realizada',
            definition: 'Soma do valor dos leads ganhos confirmados no período (closed_at).',
            formula: 'Σ value WHERE won AND closed_at BETWEEN período',
          }}
        />
        <StatCard
          label="Produtividade"
          value={(data?.salesProductivity.current ?? 0).toFixed(1)}
          current={data?.salesProductivity.current ?? 0}
          previous={data?.salesProductivity.previous ?? 0}
          icon={UserCheck}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          hint={{
            title: 'Produtividade de Vendas',
            definition: 'Média de ganhos por atendente ativo da empresa no período.',
            formula: 'won_count / atendentes_ativos',
            note: `Considerando ${data?.activeAgents ?? 0} atendente(s) ativo(s).`,
          }}
        />
      </div>


      {/* ===== SEÇÃO 1: Fechamentos & Reaberturas (eixo closed_at) ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <div className="min-w-0 h-full"><ClosingsEvolutionChart data={data?.evolution ?? []} /></div>
        <div className="min-w-0 h-full">
          <OutcomesFunnel
            closings={data?.closings ?? {
              wonCount: 0, lostCount: 0, closedCount: 0, wonRevenue: 0, lostRevenue: 0,
              winRateClosed: 0, lossRate: 0, avgWonTicket: 0, avgCycleDays: 0,
            }}
            reopenedCount={data?.reopenedCount ?? 0}
          />
        </div>
      </section>

      {/* ===== SEÇÃO 2: Estágios & Motivos de Perda ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <div className="min-w-0 h-full"><StageChart stages={data?.stages ?? []} /></div>
        <div className="min-w-0 h-full">
          <LossReasonsCard
            reasons={data?.lossReasons ?? []}
            totalLost={data?.closings.lostCount ?? 0}
            totalLostValue={data?.closings.lostRevenue ?? 0}
          />
        </div>
      </section>

      {/* ===== SEÇÃO 3: Pipeline atual ===== */}
      <section>
        <PipelineValueCard stages={data?.stages ?? []} />
      </section>

      {/* ===== SEÇÃO 4: Cruzamentos de dados ===== */}
      {data && <CompanyCrossInsights data={data} />}

      {/* ===== SEÇÃO 5: Performance da equipe (criação x fechamento) ===== */}
      <TeamPerformanceTable team={data?.team ?? []} />
    </PageShell>
  );
}
