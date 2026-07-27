import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Crown } from 'lucide-react';
import type { PlanSlice } from '@/hooks/useMasterDashboardData';

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface Props {
  slices: PlanSlice[];
}

/**
 * Top 3 planos por receita — alternativa compacta ao pie chart.
 * Cada plano em uma linha com barra de % e MRR, dimensionado para casar
 * com a altura do MrrProgressionChart na coluna ao lado.
 */
export function TopPlansMiniCards({ slices }: Props) {
  const top3 = slices.slice(0, 3);
  const totalMrr = slices.reduce((s, p) => s + p.mrr, 0) || 1;
  const totalCompanies = slices.reduce((s, p) => s + p.companies, 0) || 1;

  return (
    <Card className="animate-fade-in h-full w-full min-w-0 flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Top 3 planos por receita</CardTitle>
        <Crown className="w-4 h-4 text-[hsl(var(--amber))]" />
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between gap-3 pb-4 min-w-0">
        {top3.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Sem assinaturas ativas</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {top3.map((p, i) => {
                const pctMrr = totalMrr > 0 ? (p.mrr / totalMrr) * 100 : 0;
                const pctCompanies = totalCompanies > 0 ? (p.companies / totalCompanies) * 100 : 0;
                return (
                  <div key={p.plan} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`shrink-0 w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center ${
                          i === 0 ? 'bg-[hsl(var(--amber))]/20 text-[hsl(var(--amber))]' :
                          i === 1 ? 'bg-muted text-muted-foreground' :
                          'bg-secondary text-muted-foreground'
                        }`}>
                          {i + 1}
                        </span>
                        <span className="text-sm font-medium truncate">{p.plan}</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums shrink-0">
                        {formatBRL(p.mrr)}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-[hsl(var(--primary))] rounded-full transition-all"
                        style={{ width: `${pctMrr}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums">
                      <span>{p.companies} empresas ({pctCompanies.toFixed(1)}%)</span>
                      <span>{pctMrr.toFixed(1)}% do MRR</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-border/60 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">MRR total</p>
                <p className="font-semibold tabular-nums">{formatBRL(totalMrr)}</p>
              </div>
              <div className="text-right">
                <p className="text-muted-foreground">Planos ativos</p>
                <p className="font-semibold tabular-nums">{slices.length}</p>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
