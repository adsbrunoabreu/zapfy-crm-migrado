import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitCompare, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer, ComposedChart, BarChart, ScatterChart,
  Line, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ZAxis,
} from 'recharts';
import { usePersistedState } from '@/hooks/usePersistedState';
import { InfoHint } from './InfoHint';
import type { DashboardData } from '@/hooks/useDashboardData';

const CROSS_TAB_KEY = 'companyDashboard.crossTab';
const VALID_TABS = ['leads-conv', 'stage-value', 'team-perf', 'response-conv', 'msg-leads'] as const;
type CrossTab = typeof VALID_TABS[number];

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
  data: DashboardData;
}

/**
 * Cruzamentos de dados — escopo da empresa (5 análises).
 * Reaproveita os dados já carregados por useDashboardData.
 */
export function CompanyCrossInsights({ data }: Props) {
  const [activeTab, setActiveTab] = usePersistedState<CrossTab>(CROSS_TAB_KEY, 'leads-conv');

  // 1. Leads x Conversão (taxa real por bucket)
  const leadsVsConversion = useMemo(() => {
    return data.evolution.map((e) => ({
      label: e.label,
      Leads: e.count,
      'Conv. %': e.count > 0 ? Number(((e.won / e.count) * 100).toFixed(1)) : 0,
    }));
  }, [data.evolution]);

  // 2. Estágios x Valor (count + valor médio por estágio)
  const stageVsValue = useMemo(() => {
    return data.stages
      .filter(s => s.count > 0)
      .map((s) => ({
        label: s.label,
        Leads: s.count,
        'Valor médio': s.count > 0 ? Math.round(s.total_value / s.count) : 0,
      }));
  }, [data.stages]);

  // 3. Equipe x Performance (conversão e ticket médio)
  const teamPerf = useMemo(() => {
    return data.team.slice(0, 10).map((m) => ({
      name: m.name.length > 16 ? m.name.slice(0, 16) + '…' : m.name,
      'Conv. %': Number(m.conversion_rate.toFixed(1)),
      'Ticket médio': Math.round(m.avg_ticket),
    }));
  }, [data.team]);

  // 4. Resposta x Conversão (tempo real por membro)
  const responseVsConv = useMemo(() => {
    return data.team
      .filter(m => m.responded_count > 0)
      .slice(0, 12)
      .map((m) => ({
        name: m.name,
        'Tempo (h)': Number(m.avg_response_hours.toFixed(2)),
        'Conv. %': Number(m.conversion_rate.toFixed(1)),
        z: Math.max(1, m.total_leads),
      }));
  }, [data.team]);

  // 5. Mensagens x Leads (contagem real por bucket)
  const msgVsLeads = useMemo(() => {
    return data.evolution.map((e) => ({
      label: e.label,
      Leads: e.count,
      Mensagens: e.messages,
    }));
  }, [data.evolution]);

  const TAB_META: Record<CrossTab, { label: string; rows: Record<string, any>[] }> = {
    'leads-conv':    { label: 'Leads x Conversao',     rows: leadsVsConversion },
    'stage-value':   { label: 'Estagios x Valor',      rows: stageVsValue },
    'team-perf':     { label: 'Equipe x Performance',  rows: teamPerf },
    'response-conv': { label: 'Resposta x Conversao',  rows: responseVsConv },
    'msg-leads':     { label: 'Mensagens x Leads',     rows: msgVsLeads },
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
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <GitCompare className="w-4 h-4 text-primary" />
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
          <Badge variant="outline" className="text-[10px]">5 análises</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs
          value={(VALID_TABS as readonly string[]).includes(activeTab) ? activeTab : 'leads-conv'}
          onValueChange={(v) => setActiveTab(v as CrossTab)}
        >
          <TabsList className="grid grid-cols-2 md:grid-cols-5 h-auto gap-1 bg-secondary/30 p-1">
            <TabsTrigger value="leads-conv" className="text-[11px] py-1.5 px-2">Leads × Conv.</TabsTrigger>
            <TabsTrigger value="stage-value" className="text-[11px] py-1.5 px-2">Estágios × Valor</TabsTrigger>
            <TabsTrigger value="team-perf" className="text-[11px] py-1.5 px-2">Equipe × Perf.</TabsTrigger>
            <TabsTrigger value="response-conv" className="text-[11px] py-1.5 px-2">Resposta × Conv.</TabsTrigger>
            <TabsTrigger value="msg-leads" className="text-[11px] py-1.5 px-2">Msgs × Leads</TabsTrigger>
          </TabsList>

          {/* 1 - Leads × Conversão */}
          <TabsContent value="leads-conv" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Volume de leads ao longo do período comparado à taxa de conversão real por bucket.</p>
              <InfoHint
                title="Leads × Conversão"
                definition="Barras = leads criados por bucket. Linha = taxa de conversão real (won/total) calculada para cada bucket."
                formula="Conv. % = (leads_won / total_leads) × 100"
              />
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={leadsVsConversion} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="left" stroke="hsl(var(--primary))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--chart-2))" fontSize={11} tickLine={false} axisLine={false}
                    tickFormatter={(v) => `${v}%`} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="Leads" fill="hsl(var(--primary))" opacity={0.85} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Line yAxisId="right" type="monotone" dataKey="Conv. %" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          {/* 2 - Estágios × Valor */}
          <TabsContent value="stage-value" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Quantidade de leads e valor médio em R$ por estágio do funil.</p>
              <InfoHint
                title="Estágios × Valor"
                definition="Compara count de leads (esquerda) com valor médio em R$ (direita) por estágio."
                formula="Valor médio = Σ value / count do estágio"
              />
            </div>
            <div className="h-[260px]">
              {stageVsValue.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados no período</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stageVsValue} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" stroke="hsl(var(--primary))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--chart-2))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => formatBRLk(v)} />
                    <RTooltip contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, n: string) => n === 'Valor médio' ? [formatBRL(v), n] : [v, n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="Leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="Valor médio" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          {/* 3 - Equipe × Performance */}
          <TabsContent value="team-perf" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Ranking de membros: conversão (%) vs ticket médio (R$).</p>
              <InfoHint
                title="Equipe × Performance"
                definition="Cada membro mostra a conversão de leads atribuídos e o ticket médio gerado."
                formula="Conv. % = won / atribuídos × 100 · Ticket médio = receita / atribuídos"
              />
            </div>
            <div className="h-[260px]">
              {teamPerf.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados de equipe</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={teamPerf} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false}
                      angle={-25} textAnchor="end" height={60} />
                    <YAxis yAxisId="left" stroke="hsl(var(--primary))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${v}%`} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--chart-2))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => formatBRLk(v)} />
                    <RTooltip contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, n: string) => n === 'Ticket médio' ? [formatBRL(v), n] : [`${v}%`, n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="Conv. %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="Ticket médio" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          {/* 4 - Resposta × Conversão */}
          <TabsContent value="response-conv" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Tempo médio de resposta (eixo X, em horas) vs conversão (%) por membro. Bolha = volume.</p>
              <InfoHint
                title="Resposta × Conversão"
                definition="Dispersão por membro: quem responde mais rápido tende a converter mais."
                formula="X = horas até primeira resposta · Y = conversão % · Z (raio) = leads atribuídos"
                note="Tempo medido entre criação do lead e a primeira mensagem enviada pelo membro responsável."
              />
            </div>
            <div className="h-[260px]">
              {responseVsConv.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados de equipe</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" dataKey="Tempo (h)" name="Tempo (h)" stroke="hsl(var(--muted-foreground))" fontSize={11}
                      tickLine={false} axisLine={false} />
                    <YAxis type="number" dataKey="Conv. %" name="Conv. %" stroke="hsl(var(--muted-foreground))" fontSize={11}
                      tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                    <ZAxis type="number" dataKey="z" range={[40, 280]} />
                    <RTooltip contentStyle={TOOLTIP_STYLE} cursor={{ strokeDasharray: '3 3' }}
                      labelFormatter={(_, payload: any) => payload?.[0]?.payload?.name || ''} />
                    <Scatter data={responseVsConv} fill="hsl(var(--primary))" fillOpacity={0.7} />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          {/* 5 - Mensagens × Leads */}
          <TabsContent value="msg-leads" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">Volume real de mensagens enviadas (from_me) ao longo do período comparado à criação de leads.</p>
              <InfoHint
                title="Mensagens × Leads"
                definition="Barras agrupadas: leads criados vs mensagens enviadas pela equipe (contagem real por bucket)."
                formula="Mensagens_bucket = COUNT(chat_messages WHERE from_me=true) por bucket"
              />
            </div>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={msgVsLeads} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Leads" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="Mensagens" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
