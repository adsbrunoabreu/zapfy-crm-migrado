import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GitCompare, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer, ComposedChart, ScatterChart, BarChart,
  Line, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ZAxis, Cell,
} from 'recharts';
import { usePersistedState } from '@/hooks/usePersistedState';
import { InfoHint } from '@/components/dashboard/InfoHint';
import {
  useMedicalCrossInsights,
  type MedicalCrossFilters,
} from '@/hooks/medical/useMedicalCrossInsights';

const CROSS_TAB_KEY = 'medicalDashboard.crossTab';
const VALID_TABS = ['doctor-rev', 'proc-vol', 'payer-mix', 'doc-proc'] as const;
type CrossTab = (typeof VALID_TABS)[number];

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
  practiceId: string | null;
  filters: MedicalCrossFilters;
}

export function MedicalCrossInsights({ practiceId, filters }: Props) {
  const [activeTab, setActiveTab] = usePersistedState<CrossTab>(CROSS_TAB_KEY, 'doctor-rev');
  const { data, isLoading } = useMedicalCrossInsights(practiceId, filters);

  // 1. Médico × Receita & Conclusão
  const doctorRev = useMemo(() => {
    return data.doctor_performance.map((d) => ({
      name: d.name.length > 18 ? d.name.slice(0, 18) + '…' : d.name,
      Receita: Math.round(Number(d.revenue) || 0),
      'Conclusão %': Number(d.completion_pct) || 0,
    }));
  }, [data.doctor_performance]);

  // 2. Procedimento × Volume & Ticket (scatter)
  const procVol = useMemo(() => {
    return data.procedure_mix.map((p) => ({
      name: p.name,
      Volume: p.volume,
      Ticket: Math.round(Number(p.avg_ticket) || 0),
      Receita: Math.round(Number(p.revenue) || 0),
    }));
  }, [data.procedure_mix]);

  // 3. Pagamento × Receita
  const payerMix = useMemo(() => {
    return data.payment_mix.map((p) => ({
      method: p.method,
      Receita: Math.round(Number(p.revenue) || 0),
      'Ticket médio': Math.round(Number(p.avg_ticket) || 0),
      Recebidos: p.paid_count,
      Pendentes: p.pending_count,
    }));
  }, [data.payment_mix]);

  // 4. Médico × Procedimento (heatmap em tabela)
  const matrix = useMemo(() => {
    const doctors = new Map<string, string>();
    const procs = new Map<string, string>();
    const cells = new Map<string, { executions: number; revenue: number }>();
    let maxExec = 0;
    for (const r of data.doctor_procedure) {
      doctors.set(r.doctor_id, r.doctor_name);
      procs.set(r.procedure_id, r.procedure_name);
      cells.set(`${r.doctor_id}|${r.procedure_id}`, {
        executions: r.executions,
        revenue: Number(r.revenue) || 0,
      });
      if (r.executions > maxExec) maxExec = r.executions;
    }
    return {
      doctors: Array.from(doctors.entries()).slice(0, 12),
      procedures: Array.from(procs.entries()).slice(0, 12),
      cells,
      maxExec,
    };
  }, [data.doctor_procedure]);

  const TAB_META: Record<CrossTab, { label: string; rows: Record<string, any>[] }> = {
    'doctor-rev': { label: 'Medico x Receita',     rows: doctorRev },
    'proc-vol':   { label: 'Procedimento x Volume', rows: procVol },
    'payer-mix':  { label: 'Pagamento x Receita',   rows: payerMix },
    'doc-proc':   { label: 'Medico x Procedimento', rows: data.doctor_procedure as any },
  };

  const handleExportCsv = () => {
    const meta = TAB_META[activeTab];
    const rows = meta.rows;
    if (!rows || rows.length === 0) {
      toast.error('Sem dados para exportar nesta análise.');
      return;
    }
    const headers = Array.from(
      rows.reduce<Set<string>>((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set()),
    );
    const escape = (v: unknown) => {
      if (v == null) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",;\n\r]/.test(s) ? `"${s}"` : s;
    };
    const csv = [
      headers.join(';'),
      ...rows.map((r) => headers.map((h) => escape((r as any)[h])).join(';')),
    ].join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const safeLabel = meta.label.toLowerCase().replace(/\s+/g, '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `medico_cruzamento_${safeLabel}_${stamp}.csv`;
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
          <Badge variant="outline" className="text-[10px]">4 análises</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs
          value={(VALID_TABS as readonly string[]).includes(activeTab) ? activeTab : 'doctor-rev'}
          onValueChange={(v) => setActiveTab(v as CrossTab)}
        >
          <TabsList className="grid grid-cols-2 md:grid-cols-4 h-auto gap-1 bg-secondary/30 p-1">
            <TabsTrigger value="doctor-rev" className="text-[11px] py-1.5 px-2">Médico × Receita</TabsTrigger>
            <TabsTrigger value="proc-vol" className="text-[11px] py-1.5 px-2">Procedimento × Volume</TabsTrigger>
            <TabsTrigger value="payer-mix" className="text-[11px] py-1.5 px-2">Pagamento × Receita</TabsTrigger>
            <TabsTrigger value="doc-proc" className="text-[11px] py-1.5 px-2">Médico × Procedimento</TabsTrigger>
          </TabsList>

          {/* 1 - Médico × Receita & Conclusão */}
          <TabsContent value="doctor-rev" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">
                Receita realizada por médico (barras) contra a taxa real de conclusão das consultas (linha).
              </p>
              <InfoHint
                title="Médico × Receita & Conclusão"
                definition="Compara o faturamento gerado por cada médico com a % de consultas que foram efetivamente concluídas."
                formula="Conclusão % = consultas concluídas / total agendado × 100"
                note="Receita considera apenas consultas com status 'completed'."
              />
            </div>
            <div className="h-[280px]">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : doctorRev.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados no período</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={doctorRev} margin={{ top: 8, right: 12, bottom: 40, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false}
                      angle={-25} textAnchor="end" height={60} />
                    <YAxis yAxisId="left" stroke="hsl(var(--primary))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => formatBRLk(v)} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--chart-2))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                    <RTooltip contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, n: string) => n === 'Receita' ? [formatBRL(v), n] : [`${v}%`, n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="Conclusão %" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          {/* 2 - Procedimento × Volume & Ticket */}
          <TabsContent value="proc-vol" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">
                Dispersão por procedimento: volume executado (X), ticket médio (Y) e receita total (tamanho da bolha).
              </p>
              <InfoHint
                title="Procedimento × Volume & Ticket"
                definition="Identifica carros-chefe (alto volume + alto ticket) e procedimentos de cauda longa."
                formula="Ticket = receita / volume · Receita = Σ price de consultas concluídas"
              />
            </div>
            <div className="h-[280px]">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : procVol.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem dados no período</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 8, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" dataKey="Volume" name="Volume" stroke="hsl(var(--muted-foreground))" fontSize={11}
                      tickLine={false} axisLine={false} allowDecimals={false} />
                    <YAxis type="number" dataKey="Ticket" name="Ticket" stroke="hsl(var(--muted-foreground))" fontSize={11}
                      tickLine={false} axisLine={false} tickFormatter={(v) => formatBRLk(v)} />
                    <ZAxis type="number" dataKey="Receita" range={[60, 600]} name="Receita" />
                    <RTooltip
                      cursor={{ strokeDasharray: '3 3' }}
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const p: any = payload[0].payload;
                        return (
                          <div
                            style={TOOLTIP_STYLE}
                            className="px-3 py-2 shadow-md"
                          >
                            <div className="text-xs font-semibold mb-1">{p.name}</div>
                            <div className="text-[11px] text-muted-foreground space-y-0.5">
                              <div>Volume: <span className="text-foreground font-medium">{p.Volume} execuções</span></div>
                              <div>Ticket médio: <span className="text-foreground font-medium">{formatBRL(p.Ticket)}</span></div>
                              <div>Receita: <span className="text-foreground font-medium">{formatBRL(p.Receita)}</span></div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={procVol} fill="hsl(var(--primary))" fillOpacity={0.7} />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          {/* 3 - Pagamento × Receita */}
          <TabsContent value="payer-mix" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">
                Receita e ticket médio por método de pagamento (Convênio, Particular, Cartão, Pix, etc.).
              </p>
              <InfoHint
                title="Pagamento × Receita"
                definition="Mostra a dependência financeira de cada forma de pagamento e o ticket médio que ela gera."
                formula="Ticket médio = receita / nº de pagamentos"
                note="Pagamentos são contados pela data de recebimento (ou emissão, quando ainda pendente)."
              />
            </div>
            <div className="h-[280px]">
              {isLoading ? (
                <Skeleton className="h-full w-full" />
              ) : payerMix.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Sem pagamentos no período</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={payerMix} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="method" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis yAxisId="left" stroke="hsl(var(--primary))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => formatBRLk(v)} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--chart-2))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => formatBRLk(v)} />
                    <RTooltip contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number, n: string) => (n === 'Receita' || n === 'Ticket médio') ? [formatBRL(v), n] : [v, n]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="Receita" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                    <Line yAxisId="right" type="monotone" dataKey="Ticket médio" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
          </TabsContent>

          {/* 4 - Médico × Procedimento (heatmap) */}
          <TabsContent value="doc-proc" className="mt-4">
            <div className="flex items-center gap-1.5 mb-3">
              <p className="text-xs text-muted-foreground">
                Matriz de execuções: quantas vezes cada médico realizou cada procedimento (e a receita gerada).
              </p>
              <InfoHint
                title="Médico × Procedimento"
                definition="Mapeia a concentração de especialidades e identifica oportunidades de capacitação cruzada."
                formula="Célula = nº de execuções no período (cor = intensidade)"
              />
            </div>
            {isLoading ? (
              <Skeleton className="h-[280px] w-full" />
            ) : matrix.doctors.length === 0 || matrix.procedures.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-muted-foreground">
                Sem cruzamentos no período
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border/40">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-secondary/40">
                      <th className="text-left p-2 sticky left-0 bg-secondary/40 font-medium text-muted-foreground">Médico \ Procedimento</th>
                      {matrix.procedures.map(([pid, pname]) => (
                        <th key={pid} className="p-2 text-center font-medium text-muted-foreground whitespace-nowrap max-w-[120px] truncate" title={pname}>
                          {pname.length > 14 ? pname.slice(0, 14) + '…' : pname}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.doctors.map(([did, dname]) => (
                      <tr key={did} className="border-t border-border/30">
                        <td className="p-2 sticky left-0 bg-card font-medium whitespace-nowrap max-w-[160px] truncate" title={dname}>
                          {dname}
                        </td>
                        {matrix.procedures.map(([pid]) => {
                          const cell = matrix.cells.get(`${did}|${pid}`);
                          const intensity = cell && matrix.maxExec > 0 ? cell.executions / matrix.maxExec : 0;
                          return (
                            <td
                              key={pid}
                              className="p-0 text-center"
                              title={cell ? `${cell.executions} execuções · ${formatBRL(cell.revenue)}` : 'Sem execuções'}
                            >
                              <div
                                className="m-1 rounded px-2 py-1.5 text-[11px] font-medium"
                                style={{
                                  background: cell
                                    ? `hsl(var(--primary) / ${Math.max(0.08, intensity * 0.85)})`
                                    : 'transparent',
                                  color: intensity > 0.5 ? 'hsl(var(--primary-foreground))' : undefined,
                                }}
                              >
                                {cell ? cell.executions : '—'}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default MedicalCrossInsights;
