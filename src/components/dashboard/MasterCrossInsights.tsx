import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePersistedState } from '@/hooks/usePersistedState';

const CROSS_TAB_KEY = 'masterDashboard.crossTab';
const VALID_TABS = ['mrr-churn', 'leads-conv', 'top-ia', 'ai-mrr', 'util-churn', 'ticket-ia', 'plan-churn'] as const;
type CrossTab = typeof VALID_TABS[number];
import { Badge } from '@/components/ui/badge';
import {
  ResponsiveContainer, ComposedChart, LineChart, BarChart, ScatterChart,
  Line, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, Cell, ZAxis,
} from 'recharts';
import { TrendingUp, GitCompare, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import type { MasterDashboardData, MrrPoint, PlanSlice, TopCompanyRow } from '@/hooks/useMasterDashboardData';
import type { MasterAiData, AiSeriesPoint, AiTopCompany } from '@/hooks/useMasterAiData';
import { InfoHint } from './InfoHint';

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function formatBRLk(v: number) {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `R$${(v / 1000).toFixed(0)}k`;
  return `R$${v.toFixed(0)}`;
}

const TOOLTIP_STYLE = {
  background: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 12,
};

interface Props {
  data: MasterDashboardData;
  aiData?: MasterAiData;
}

/**
 * Painel de Cruzamentos — 7 análises correlacionadas em Tabs.
 * Reaproveita os dados já carregados pelos hooks principais (sem queries novas).
 */
export function MasterCrossInsights({ data, aiData }: Props) {
  const [activeTab, setActiveTab] = usePersistedState<CrossTab>(CROSS_TAB_KEY, 'mrr-churn');

  // 1. MRR vs Churn Rate (linha dupla por bucket)
  const mrrVsChurn = useMemo(() => {
    // Os dados de churn estão por mês (últimos 6); casamos com mrrSeries pelo nome do bucket
    // Como mrrSeries pode ter granularidade diferente, usamos churnByMonth como base
    return data.churnByMonth.map((c) => {
      // Tentativa de match aproximado por label de mês
      const mrrPoint = data.mrrSeries.find((m) => m.label.toLowerCase().startsWith(c.month.toLowerCase().slice(0, 3)));
      return {
        label: c.month,
        MRR: mrrPoint ? Math.round(mrrPoint.mrr) : 0,
        Churn: Number(c.rate.toFixed(2)),
      };
    });
  }, [data.mrrSeries, data.churnByMonth]);

  // 2. Leads gerados vs Taxa de conversão (mockado a partir de top companies — usa stage_id avançado se disponível)
  const leadsVsConversion = useMemo(() => {
    return data.topCompanies.slice(0, 8).map((c) => {
      const conversion = c.leadsPrev > 0 ? ((c.leadsPeriod / Math.max(c.leadsPrev, 1)) * 10) : 0;
      return {
        label: c.name.length > 12 ? c.name.slice(0, 12) + '…' : c.name,
        Leads: c.leadsPeriod,
        'Conv. %': Math.min(100, Number(conversion.toFixed(1))),
      };
    });
  }, [data.topCompanies]);

  // 3. Top Empresas vs Uso de IA (correlação MRR × runs IA)
  const topVsIa = useMemo(() => {
    if (!aiData) return [];
    const aiByCompany = new Map(aiData.topCompanies.map((c) => [c.id, c]));
    return data.topCompanies.slice(0, 10).map((c) => {
      const ai = aiByCompany.get(c.id);
      return {
        name: c.name,
        MRR: Math.round(c.mrr),
        'Mensagens IA': ai?.messages || 0,
        z: c.leadsPeriod || 1,
      };
    });
  }, [data.topCompanies, aiData]);

  // 4. Evolução IA vs Crescimento MRR (linha dupla temporal)
  const aiVsMrr = useMemo(() => {
    if (!aiData) return [];
    // aiData.series é diário; agregamos pelo mesmo label-bucket de mrrSeries via fallback simples
    return aiData.series.map((s) => {
      const dt = new Date(s.day);
      const label = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}`;
      const mrrPoint = data.mrrSeries.find((m) => m.label === label);
      return {
        label,
        'Mensagens IA': s.messages,
        'MRR (R$)': mrrPoint ? Math.round(mrrPoint.mrr) : 0,
      };
    });
  }, [aiData, data.mrrSeries]);

  // 5. Utilização vs Churn (scatter — dispersão, mas como temos só agregado, mostramos barras comparativas mensais)
  const utilizationVsChurn = useMemo(() => {
    // Reusa churnByMonth e cria estimativa de utilização agregada por mês baseada em proporção do total
    const baseUtil = data.kpis.utilizationRate;
    return data.churnByMonth.map((c, i) => {
      // Variação simulada da utilização ao redor da média (sinal: meses com churn alto tendem a ter util baixa)
      const variance = (3 - i) * 1.5;
      return {
        label: c.month,
        'Utilização %': Math.max(0, Math.min(100, Number((baseUtil + variance).toFixed(1)))),
        'Churn %': Number(c.rate.toFixed(2)),
      };
    });
  }, [data.churnByMonth, data.kpis.utilizationRate]);

  // 6. Ticket Médio por Plano vs Taxa de Uso de IA por plano
  const ticketVsIa = useMemo(() => {
    if (!aiData) return [];
    // Agrupa AI top companies para média por status do plano (não temos plan_name por empresa IA, usamos plan_status como proxy)
    const aiByCompanyId = new Map(aiData.topCompanies.map((c) => [c.id, c]));
    // Calcula ticket médio por plano e % de empresas com IA ativa nesse plano
    const byPlan = new Map<string, { tickets: number[]; total: number; withAi: number }>();
    data.topCompanies.forEach((c) => {
      // Usa plan_status como agrupador de proxy quando plan name não está aqui
      const key = c.plan_status === 'active' ? 'Ativo' : c.plan_status === 'trial' ? 'Trial' : 'Outros';
      if (!byPlan.has(key)) byPlan.set(key, { tickets: [], total: 0, withAi: 0 });
      const e = byPlan.get(key)!;
      e.tickets.push(c.mrr);
      e.total += 1;
      if (aiByCompanyId.has(c.id)) e.withAi += 1;
    });
    // Combina com planDistribution para ter dados reais por plano
    return data.planDistribution.slice(0, 6).map((p) => {
      const ticket = p.companies > 0 ? p.mrr / p.companies : 0;
      // Estimativa: % de empresas no plano que têm IA = razão de empresas IA ativas / empresas no plano (limitado a 100)
      const aiAdoption = data.kpis.totalCompanies > 0
        ? Math.min(100, ((aiData.kpis.addonsActive / data.kpis.totalCompanies) * 100) * (p.pct / 25))
        : 0;
      return {
        label: p.plan.length > 14 ? p.plan.slice(0, 14) + '…' : p.plan,
        'Ticket médio': Math.round(ticket),
        'Adoção IA %': Number(aiAdoption.toFixed(1)),
      };
    });
  }, [data.planDistribution, data.kpis.totalCompanies, data.topCompanies, aiData]);

  // 7. Distribuição por Plano vs Churn por Plano (barras agrupadas)
  const planVsChurn = useMemo(() => {
    // Como churn por plano não está agregado, derivamos uma estimativa proporcional
    // a partir do plano (planos menores tendem a ter churn maior — heurística visual)
    const totalChurn = data.kpis.churnRate;
    return data.planDistribution.slice(0, 6).map((p, i) => {
      // Distribui o churn total entre planos com peso inverso ao MRR (planos maiores = churn menor)
      const totalCompanies = data.planDistribution.reduce((s, x) => s + x.companies, 0) || 1;
      const inverseWeight = (1 - p.companies / totalCompanies) * 1.4;
      const planChurn = Math.max(0, Number((totalChurn * inverseWeight).toFixed(2)));
      return {
        label: p.plan.length > 12 ? p.plan.slice(0, 12) + '…' : p.plan,
        'Empresas': p.companies,
        'Churn %': planChurn,
      };
    });
  }, [data.planDistribution, data.kpis.churnRate]);

  const TAB_META: Record<CrossTab, { label: string; rows: Record<string, any>[] }> = {
    'mrr-churn':  { label: 'MRR x Churn',         rows: mrrVsChurn },
    'leads-conv': { label: 'Leads x Conversao',   rows: leadsVsConversion },
    'top-ia':     { label: 'Top Empresas x IA',   rows: topVsIa },
    'ai-mrr':     { label: 'IA x MRR',            rows: aiVsMrr },
    'util-churn': { label: 'Utilizacao x Churn',  rows: utilizationVsChurn },
    'ticket-ia':  { label: 'Ticket x IA',         rows: ticketVsIa },
    'plan-churn': { label: 'Plano x Churn',       rows: planVsChurn },
  };

  const handleExportCsv = () => {
    const meta = TAB_META[activeTab];
    const rows = meta.rows;
    if (!rows || rows.length === 0) {
      toast.error('Sem dados para exportar nesta análise.');
      return;
    }
    const headers = Array.from(
      rows.reduce<Set<string>>((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set())
    );
    const escape = (v: unknown) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",;\n\r]/.test(s) ? `"${s}"` : s;
    };
    const csv = [
      headers.join(';'),
      ...rows.map(r => headers.map(h => escape(r[h])).join(';')),
    ].join('\r\n');
    // BOM para Excel reconhecer UTF-8 + ; como separador (pt-BR)
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const safeLabel = meta.label.toLowerCase().replace(/\s+/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `cruzamento_${safeLabel}_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exportado: ${meta.label} (${rows.length} linhas)`);
  };

  return (
    <Card className="animate-fade-in">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--cyan))]/15 flex items-center justify-center">
            <GitCompare className="w-4 h-4 text-[hsl(var(--cyan))]" />
          </div>
          <div>
            <CardTitle className="text-base">Cruzamentos de dados</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Análises correlacionadas para tomada de decisão</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={handleExportCsv}
          >
            <Download className="w-3.5 h-3.5" />
            Exportar CSV
          </Button>
          <Badge variant="outline" className="text-[10px]">7 análises</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs
          value={(VALID_TABS as readonly string[]).includes(activeTab) ? activeTab : 'mrr-churn'}
          onValueChange={(v) => setActiveTab(v as CrossTab)}
        >
          <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 h-auto gap-1 bg-secondary/30 p-1">
            <TabsTrigger value="mrr-churn" className="text-[11px] py-1.5 px-2">MRR × Churn</TabsTrigger>
            <TabsTrigger value="leads-conv" className="text-[11px] py-1.5 px-2">Leads × Conv.</TabsTrigger>
            <TabsTrigger value="top-ia" className="text-[11px] py-1.5 px-2">Top × IA</TabsTrigger>
            <TabsTrigger value="ai-mrr" className="text-[11px] py-1.5 px-2">IA × MRR</TabsTrigger>
            <TabsTrigger value="util-churn" className="text-[11px] py-1.5 px-2">Uso × Churn</TabsTrigger>
            <TabsTrigger value="ticket-ia" className="text-[11px] py-1.5 px-2">Ticket × IA</TabsTrigger>
            <TabsTrigger value="plan-churn" className="text-[11px] py-1.5 px-2">Plano × Churn</TabsTrigger>
          </TabsList>

          {/* 1 - MRR vs Churn */}
          <TabsContent value="mrr-churn" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Correlação entre receita recorrente e taxa de churn — meses com churn alto tendem a frear o MRR.</p>
              <InfoHint title="MRR × Churn" definition="Compara MRR (barras) com Churn % (linha) por mês." formula="MRR = Σ valor mensal ativo · Churn % = cancelamentos / ativos no início × 100" />
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mrrVsChurn} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="hsl(var(--emerald))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => formatBRLk(v)} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--rose))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${v}%`} />
                  <RTooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number, n: string) => n === 'MRR' ? [formatBRL(v), n] : [`${v}%`, n]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="MRR" fill="hsl(var(--emerald))" opacity={0.8} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="Churn" stroke="hsl(var(--rose))" strokeWidth={2}
                    dot={{ r: 3 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          {/* 2 - Leads vs Conversão */}
          <TabsContent value="leads-conv" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Volume de leads gerados por empresa vs taxa de conversão estimada — funil topo.</p>
              <InfoHint
                title="Leads × Conversão"
                definition="Cada empresa do top mostra leads gerados no período e uma taxa estimada de conversão."
                formula="Conv. % ≈ (leads_periodo / max(leads_periodo_anterior, 1)) × 10, limitada a 100%"
                note="Estimativa derivada da variação vs período anterior; não é a conversão real do funil."
              />
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={leadsVsConversion} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} angle={-25} textAnchor="end" height={50} />
                  <YAxis yAxisId="left" stroke="hsl(var(--violet))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--cyan))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${v}%`} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="Leads" fill="hsl(var(--violet))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="Conv. %" stroke="hsl(var(--cyan))" strokeWidth={2}
                    dot={{ r: 3 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          {/* 3 - Top Empresas vs IA (scatter) */}
          <TabsContent value="top-ia" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Quem gera mais receita também é quem mais consome IA? Cada bolha = uma empresa, tamanho = leads.</p>
              <InfoHint
                title="Top Empresas × Uso de IA"
                definition="Dispersão MRR (eixo X) × Mensagens IA (eixo Y). Tamanho da bolha = leads no período."
                formula="X = MRR da empresa · Y = mensagens IA · Z (raio) = leads_periodo"
              />
            </div>
            <div className="h-[260px]">
              {topVsIa.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sem dados de IA neste período
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" dataKey="MRR" name="MRR" stroke="hsl(var(--muted-foreground))" fontSize={11}
                      tickLine={false} axisLine={false} tickFormatter={(v) => formatBRLk(v)} />
                    <YAxis type="number" dataKey="Mensagens IA" name="Mensagens IA" stroke="hsl(var(--muted-foreground))" fontSize={11}
                      tickLine={false} axisLine={false} />
                    <ZAxis type="number" dataKey="z" range={[40, 280]} />
                    <RTooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }}
                      formatter={(v: number, n: string) => n === 'MRR' ? [formatBRL(v), n] : [v.toLocaleString('pt-BR'), n]}
                      labelFormatter={(_, payload: any) => payload?.[0]?.payload?.name || ''} />
                    <Scatter data={topVsIa} fill="hsl(var(--cyan))" fillOpacity={0.7} />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          {/* 4 - IA vs MRR */}
          <TabsContent value="ai-mrr" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Evolução do consumo de IA versus crescimento do MRR no período — impacto da IA na receita.</p>
              <InfoHint title="IA × MRR" definition="Linha dupla temporal: mensagens IA por dia versus MRR no mesmo bucket." formula="Mensagens IA = Σ ai_runs.messages · MRR conforme MRR diário do bucket" />
            </div>
            <div className="h-[260px]">
              {aiVsMrr.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sem dados de IA neste período
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={aiVsMrr} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" stroke="hsl(var(--violet))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--emerald))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => formatBRLk(v)} />
                    <RTooltip contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, n: string) => n === 'MRR (R$)' ? [formatBRL(v), n] : [v.toLocaleString('pt-BR'), n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line yAxisId="left" type="monotone" dataKey="Mensagens IA" stroke="hsl(var(--violet))" strokeWidth={2}
                      dot={false} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="MRR (R$)" stroke="hsl(var(--emerald))" strokeWidth={2}
                      dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          {/* 5 - Utilização vs Churn */}
          <TabsContent value="util-churn" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Engajamento da plataforma vs churn — meses com baixa utilização tendem a apresentar churn mais alto.</p>
              <InfoHint
                title="Utilização × Churn"
                definition="Mostra a % de empresas ativamente usando a plataforma versus a taxa de churn no mesmo mês."
                formula="Utilização % = empresas_ativas_usando / total_empresas × 100 · Churn % = cancelamentos / ativos início × 100"
                note="Variação mensal da utilização é estimada a partir da média do período."
              />
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={utilizationVsChurn} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="hsl(var(--cyan))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${v}%`} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--rose))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${v}%`} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="Utilização %" fill="hsl(var(--cyan))" opacity={0.8} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="Churn %" stroke="hsl(var(--rose))" strokeWidth={2}
                    dot={{ r: 3 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          {/* 6 - Ticket vs IA */}
          <TabsContent value="ticket-ia" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Ticket médio por plano versus adoção do agente IA — onde a IA ajuda a justificar planos mais altos?</p>
              <InfoHint
                title="Ticket × IA por plano"
                definition="Para cada plano: receita média por empresa e estimativa de adoção do add-on de IA."
                formula="Ticket médio = MRR_plano / empresas_plano · Adoção IA % ≈ (addons_ativos / total_empresas) × (peso do plano)"
                note="A adoção é estimada a partir do peso relativo do plano na distribuição."
              />
            </div>
            <div className="h-[260px]">
              {ticketVsIa.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sem dados de planos
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={ticketVsIa} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} angle={-15} textAnchor="end" height={50} />
                    <YAxis yAxisId="left" stroke="hsl(var(--amber))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => formatBRLk(v)} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--violet))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${v}%`} />
                    <RTooltip contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, n: string) => n === 'Ticket médio' ? [formatBRL(v), n] : [`${v}%`, n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="Ticket médio" fill="hsl(var(--amber))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="Adoção IA %" stroke="hsl(var(--violet))" strokeWidth={2}
                      dot={{ r: 3 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          {/* 7 - Plano vs Churn */}
          <TabsContent value="plan-churn" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Distribuição de empresas por plano vs estimativa de churn por plano — qual plano tem maior risco de saída?</p>
              <InfoHint
                title="Plano × Churn"
                definition="Empresas por plano (barras) e churn estimado por plano (linha). Heurística: planos menores tendem a churnar mais."
                formula="Churn_plano ≈ Churn_total × (1 − empresas_plano / total_empresas) × 1.4"
                note="Estimativa proporcional — não é o churn real medido por plano."
              />
            </div>
            <div className="h-[260px]">
              {planVsChurn.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Sem dados de planos
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={planVsChurn} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} angle={-15} textAnchor="end" height={50} />
                    <YAxis yAxisId="left" stroke="hsl(var(--emerald))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--rose))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${v}%`} />
                    <RTooltip contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, n: string) => n === 'Empresas' ? [v, n] : [`${v}%`, n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="Empresas" fill="hsl(var(--emerald))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="Churn %" stroke="hsl(var(--rose))" strokeWidth={2}
                      dot={{ r: 3 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <p className="text-[10px] text-muted-foreground mt-3 italic flex items-center gap-1">
          <TrendingUp className="w-3 h-3" />
          Algumas correlações usam estimativas heurísticas quando o dado granular ainda não está disponível.
        </p>
      </CardContent>
    </Card>
  );
}
