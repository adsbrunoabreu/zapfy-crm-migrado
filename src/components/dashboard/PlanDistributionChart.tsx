import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip } from 'recharts';
import type { PlanSlice } from '@/hooks/useMasterDashboardData';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
];

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function PlanDistributionChart({ slices }: { slices: PlanSlice[] }) {
  const totalCompanies = slices.reduce((s, p) => s + p.companies, 0);
  const totalMrr = slices.reduce((s, p) => s + p.mrr, 0);

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="text-base">Distribuição por plano</CardTitle>
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <div className="h-60 flex items-center justify-center text-sm text-muted-foreground">Sem assinaturas ativas.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-center">
            <div className="md:col-span-2 h-60">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={slices}
                    dataKey="companies"
                    nameKey="plan"
                    innerRadius={50}
                    outerRadius={88}
                    paddingAngle={2}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  >
                    {slices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <RTooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                    formatter={(_v: any, _n: any, p: any) => [
                      `${p.payload.companies} empresas · ${formatBRL(p.payload.mrr)} MRR`,
                      p.payload.plan,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="md:col-span-3 space-y-2 text-sm">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 text-[11px] uppercase tracking-wide text-muted-foreground font-medium pb-1.5 border-b border-border/60">
                <span>Plano</span><span className="text-right">Emp.</span><span className="text-right">MRR</span><span className="text-right">%</span>
              </div>
              {slices.map((s, i) => (
                <div key={s.plan} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
                  <span className="flex items-center gap-2 truncate">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="truncate">{s.plan}</span>
                  </span>
                  <span className="text-right tabular-nums">{s.companies}</span>
                  <span className="text-right tabular-nums">{formatBRL(s.mrr)}</span>
                  <span className="text-right tabular-nums text-muted-foreground">{s.pct.toFixed(0)}%</span>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 pt-2 border-t border-border/60 text-xs font-medium">
                <span className="text-muted-foreground">Total</span>
                <span className="text-right tabular-nums">{totalCompanies}</span>
                <span className="text-right tabular-nums">{formatBRL(totalMrr)}</span>
                <span className="text-right tabular-nums text-muted-foreground">100%</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
