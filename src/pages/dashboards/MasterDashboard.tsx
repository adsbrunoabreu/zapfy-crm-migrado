import { PageShell } from '@/components/layout/PageShell';
import { useEffect, useMemo } from 'react';
import { CircleDollarSign, DollarSign, TrendingDown, Building2, Users, Wallet, Bot } from 'lucide-react';
import { usePersistedState } from '@/hooks/usePersistedState';
import { parsePersistedAppDateRange, serializeAppDateRange } from '@/lib/appDate';
import { toast } from 'sonner';
import { useMasterDashboardData, type MasterPeriod } from '@/hooks/useMasterDashboardData';
import { useMasterAiData } from '@/hooks/useMasterAiData';
import { DashboardSkeleton } from '@/components/skeletons/PageSkeletons';
import { AiKpisRow } from '@/components/dashboard/AiKpisRow';
import { AiUsageChart } from '@/components/dashboard/AiUsageChart';
import { TopAiCompaniesTable } from '@/components/dashboard/TopAiCompaniesTable';
import { AiHealthCard } from '@/components/dashboard/AiHealthCard';
import { AiOpportunityCard } from '@/components/dashboard/AiOpportunityCard';
import { MasterDateRangeFilter } from '@/components/dashboard/MasterDateRangeFilter';
import { StatCard } from '@/components/dashboard/StatCard';
import { MrrProgressionChart } from '@/components/dashboard/MrrProgressionChart';
import { CompanyGrowthChart } from '@/components/dashboard/CompanyGrowthChart';

import { TopCompaniesTable } from '@/components/dashboard/TopCompaniesTable';
import { ChurnAnalysisCard } from '@/components/dashboard/ChurnAnalysisCard';
import { OpportunitiesCard } from '@/components/dashboard/OpportunitiesCard';
import { PlatformActivityCard } from '@/components/dashboard/PlatformActivityCard';
import { ActivityStatusTable } from '@/components/dashboard/ActivityStatusTable';
import { TopPlansMiniCards } from '@/components/dashboard/TopPlansMiniCards';
import { MasterCrossInsights } from '@/components/dashboard/MasterCrossInsights';
import { MasterWonLostSection } from '@/components/dashboard/MasterWonLostSection';
import { useMasterWonLostData } from '@/hooks/useMasterWonLostData';
import { AtRiskSettingsDialog } from '@/components/dashboard/AtRiskSettingsDialog';
import { UpsellOpportunitiesTable } from '@/components/dashboard/UpsellOpportunitiesTable';
import { UpsellSettingsDialog } from '@/components/dashboard/UpsellSettingsDialog';
import { loadAtRiskConfig, saveAtRiskConfig, resetAtRiskConfig, DEFAULT_AT_RISK_CONFIG, type AtRiskConfig } from '@/lib/atRiskScoring';
import { loadUpsellConfig, saveUpsellConfig, resetUpsellConfig, DEFAULT_UPSELL_CONFIG, type UpsellConfig } from '@/lib/upsellScoring';
import { formatBRL, formatPeriodLabel } from '@/lib/format';
import { useState } from 'react';

interface PersistedRange { from: string; to: string }

export default function MasterDashboard() {
  const [period, setPeriod] = usePersistedState<MasterPeriod>('masterDashboard.period', '30d');
  const [persistedRange, setPersistedRange] = usePersistedState<PersistedRange | null>('masterDashboard.customRange', null);

  const customRange = useMemo(
    () => parsePersistedAppDateRange(persistedRange ?? undefined),
    [persistedRange],
  );

  const [atRiskConfig, setAtRiskConfig] = useState<AtRiskConfig>(() => loadAtRiskConfig());
  const [riskDialogOpen, setRiskDialogOpen] = useState(false);
  const [upsellConfig, setUpsellConfig] = useState<UpsellConfig>(() => loadUpsellConfig());
  const [upsellDialogOpen, setUpsellDialogOpen] = useState(false);

  const { data, isLoading, isFetching, error } = useMasterDashboardData(period, customRange, atRiskConfig, upsellConfig);
  const { data: aiData, isLoading: aiLoading, error: aiError } = useMasterAiData(period, customRange);

  const { data: wonLost } = useMasterWonLostData(period, customRange);

  useEffect(() => {
    if (error) toast.error('Erro ao carregar painel master', { description: (error as Error).message });
  }, [error]);

  useEffect(() => {
    if (aiError) toast.error('Erro ao carregar dados de IA', { description: (aiError as Error).message });
  }, [aiError]);

  if (isLoading && !data) return <DashboardSkeleton />;
  if (!data) return <DashboardSkeleton />;

  const { kpis, mrrSeries, companyGrowth, planDistribution, topCompanies, atRisk, upsell, churnByMonth, range, validation } = data;
  const periodLabel = formatPeriodLabel(period, range);

  const handleRangeChange = (p: MasterPeriod, c?: { from: Date; to: Date }) => {
    setPeriod(p);
    if (c) setPersistedRange(serializeAppDateRange(c));
    else setPersistedRange(null);
  };

  return (
    <PageShell
      title="Painel Master"
      subtitle={`Saúde do negócio · ${periodLabel}${isFetching && !isLoading ? ' · atualizando…' : ''}`}
      actions={
        <>
          <MasterDateRangeFilter
            period={period}
            customRange={customRange}
            onChange={handleRangeChange}
          />
        </>
      }
    >

      {/* KPIs - linha 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          label="MRR" value={formatBRL(kpis.mrr)}
          rawValue={kpis.mrr} countUp
          current={kpis.mrr} previous={kpis.prevMrr}
          icon={CircleDollarSign}
          iconColor="text-[hsl(var(--chart-1))]" iconBg="bg-[hsl(var(--chart-1))]/15"
          hint={{
            title: 'MRR — Receita Recorrente Mensal',
            definition: 'Soma do valor mensal de todas as assinaturas ativas no fim do período.',
            formula: 'Σ valor_mensal das assinaturas com status = active',
            note: 'Planos anuais são divididos por 12 para entrar no MRR.',
          }}
        />
        <StatCard
          label="ARR" value={formatBRL(kpis.arr)}
          rawValue={kpis.arr} countUp
          current={kpis.arr} previous={kpis.prevArr}
          icon={DollarSign}
          iconColor="text-[hsl(var(--chart-2))]" iconBg="bg-[hsl(var(--chart-2))]/15"
          hint={{
            title: 'ARR — Receita Recorrente Anual',
            definition: 'Projeção anual da receita recorrente, assumindo o MRR atual estável por 12 meses.',
            formula: 'ARR = MRR × 12',
          }}
        />
        <StatCard
          label="Churn Rate"
          value={`${kpis.churnRate.toFixed(1)}%`}
          current={kpis.churnRate} previous={kpis.prevChurnRate}
          deltaUnit="pp" invertDelta
          icon={TrendingDown}
          iconColor={kpis.churnRate < 5 ? 'text-[hsl(var(--emerald))]' : kpis.churnRate < 10 ? 'text-[hsl(var(--amber))]' : 'text-[hsl(var(--rose))]'}
          iconBg={kpis.churnRate < 5 ? 'bg-[hsl(var(--emerald))]/15' : kpis.churnRate < 10 ? 'bg-[hsl(var(--amber))]/15' : 'bg-[hsl(var(--rose))]/15'}
          hint={{
            title: 'Churn Rate',
            definition: '% de empresas pagantes que cancelaram a assinatura no período em relação ao total ativo no início.',
            formula: 'Churn % = (cancelamentos no período / ativos no início) × 100',
            note: 'Saudável: < 5% ao mês. Variação medida em pontos percentuais (pp).',
          }}
        />
      </div>

      {/* KPIs - linha 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          label="Total de empresas"
          value={kpis.totalCompanies.toLocaleString('pt-BR')}
          rawValue={kpis.totalCompanies} countUp
          current={kpis.newCompanies} previous={kpis.prevNewCompanies}
          icon={Building2}
          iconColor="text-primary" iconBg="bg-primary/15"
          hint={{
            title: 'Total de empresas',
            definition: 'Quantidade de empresas (tenants) cadastradas na plataforma, em qualquer status.',
            formula: 'COUNT(companies)',
            note: 'O delta compara empresas novas no período vs período anterior.',
          }}
        />
        <StatCard
          label="Leads gerados (plataforma)"
          value={kpis.totalLeads.toLocaleString('pt-BR')}
          rawValue={kpis.totalLeads} countUp
          current={kpis.totalLeads} previous={kpis.prevTotalLeads}
          icon={Users}
          iconColor="text-[hsl(var(--chart-3))]" iconBg="bg-[hsl(var(--chart-3))]/15"
          hint={{
            title: 'Leads gerados',
            definition: 'Total de leads criados em todas as empresas dentro do período selecionado.',
            formula: 'COUNT(leads WHERE created_at BETWEEN período)',
          }}
        />
        <StatCard
          label="Ticket médio (ARR/empresa)"
          value={formatBRL(kpis.avgTicket)}
          rawValue={kpis.avgTicket} countUp
          current={kpis.avgTicket} previous={kpis.prevAvgTicket}
          icon={Wallet}
          iconColor="text-[hsl(var(--chart-4))]" iconBg="bg-[hsl(var(--chart-4))]/15"
          hint={{
            title: 'Ticket médio',
            definition: 'Receita anual média por empresa pagante — indica o valor médio do contrato.',
            formula: 'Ticket médio = ARR / nº empresas com assinatura ativa',
          }}
        />
      </div>

      {/* ===== SEÇÃO 1: Receita & Clientes (2 colunas balanceadas) ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <MrrProgressionChart data={mrrSeries} />
        <TopPlansMiniCards slices={planDistribution} />
      </section>

      {/* ===== SEÇÃO 2: Retenção & Atividade (2 colunas) ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <ChurnAnalysisCard
          churnRate={kpis.churnRate}
          prevChurnRate={kpis.prevChurnRate}
          retentionRate={kpis.retentionRate}
          nrr={kpis.nrr}
          churnByMonth={churnByMonth}
          validation={validation}
        />
        <CompanyGrowthChart data={companyGrowth} />
      </section>

      {/* ===== SEÇÃO 3: Dados tabulares (2 colunas) ===== */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <TopCompaniesTable rows={topCompanies.slice(0, 5)} />
        <ActivityStatusTable kpis={kpis} periodLabel={periodLabel} />
      </section>

      {/* ===== Atividade detalhada da plataforma (full-width auxiliar) ===== */}
      <PlatformActivityCard
        totalLeads={kpis.totalLeads}
        prevTotalLeads={kpis.prevTotalLeads}
        messagesPeriod={kpis.messagesPeriod}
        prevMessagesPeriod={kpis.prevMessagesPeriod}
        activeCompaniesUsing={Math.round((kpis.utilizationRate / 100) * kpis.totalCompanies)}
        totalCompanies={kpis.totalCompanies}
        utilizationRate={kpis.utilizationRate}
        periodLabel={periodLabel}
      />

      {/* ===== Cruzamentos de dados (Tabs com 7 análises) ===== */}
      <MasterCrossInsights data={data} aiData={aiData ?? undefined} />

      {/* ===== Ganho vs Perda (eventos do fluxo Won/Lost) ===== */}
      {wonLost && <MasterWonLostSection data={wonLost} periodLabel={periodLabel} />}

      {/* ===== Oportunidades (resumo) ===== */}
      <OpportunitiesCard
        atRisk={atRisk}
        upsell={upsell}
        onConfigureRisk={() => setRiskDialogOpen(true)}
      />

      {/* ===== Tabela detalhada de upsell ===== */}
      <UpsellOpportunitiesTable
        rows={upsell}
        onConfigure={() => setUpsellDialogOpen(true)}
      />

      <AtRiskSettingsDialog
        open={riskDialogOpen}
        onOpenChange={setRiskDialogOpen}
        value={atRiskConfig}
        onChange={(cfg) => { setAtRiskConfig(cfg); saveAtRiskConfig(cfg); }}
        onReset={() => { resetAtRiskConfig(); setAtRiskConfig(DEFAULT_AT_RISK_CONFIG); }}
      />

      <UpsellSettingsDialog
        open={upsellDialogOpen}
        onOpenChange={setUpsellDialogOpen}
        value={upsellConfig}
        onChange={(cfg) => { setUpsellConfig(cfg); saveUpsellConfig(cfg); }}
        onReset={() => { resetUpsellConfig(); setUpsellConfig(DEFAULT_UPSELL_CONFIG); }}
      />

      {/* ===== SEÇÃO 4: Agente IA (header + 2 colunas) ===== */}
      <section className="pt-4 border-t border-border space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--chart-3))]/15 flex items-center justify-center">
            <Bot className="w-4 h-4 text-[hsl(var(--chart-3))]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Agente IA</h2>
            <p className="text-xs text-muted-foreground">Uso, custo e adoção do módulo de IA · {periodLabel}</p>
          </div>
        </div>

        {aiLoading || !aiData ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[112px] rounded-lg bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <AiKpisRow kpis={aiData.kpis} blockedCount={aiData.blocked.length} />

            {/* IA: 2 colunas balanceadas (gráfico + saúde) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              <AiUsageChart data={aiData.series} />
              <AiHealthCard
                kpis={aiData.kpis}
                models={aiData.models}
                kb={aiData.kb}
                blocked={aiData.blocked}
              />
            </div>

            {/* IA: tabelas/oportunidades em 2 colunas */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              <TopAiCompaniesTable rows={aiData.topCompanies} />
              <AiOpportunityCard opportunities={aiData.opportunities} />
            </div>
          </>
        )}
      </section>
    </PageShell>
  );
}
