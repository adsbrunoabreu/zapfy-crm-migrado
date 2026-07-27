import { Card } from '@/components/ui/card';
import type { StageBreakdown } from '@/hooks/useDashboardData';
import { InfoHint } from './InfoHint';

interface Props { stages: StageBreakdown[]; }

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function PipelineValueCard({ stages }: Props) {
  const ordered = [...stages].filter(s => s.total_value > 0).sort((a, b) => b.total_value - a.total_value);
  const total = ordered.reduce((s, x) => s + x.total_value, 0);
  const wonValue = ordered.filter(s => s.stage_type === 'won').reduce((s, x) => s + x.total_value, 0);
  const closeRate = total > 0 ? (wonValue / total) * 100 : 0;
  const max = ordered[0]?.total_value || 1;

  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
            Valor em Pipeline
            <InfoHint
              title="Valor em pipeline"
              definition="Soma do campo valor (R$) dos leads em cada estágio do pipeline. Indica o potencial de receita por etapa."
              formula="Σ value dos leads agrupado por status · Fechado % = valor_won / valor_total"
            />
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Por estágio</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums">{fmt(total)}</p>
          <p className="text-[11px] text-muted-foreground">
            Fechado: <span className="text-[hsl(var(--emerald))] font-medium">{closeRate.toFixed(1)}%</span>
          </p>
        </div>
      </div>

      {ordered.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
          Nenhum valor registrado no período
        </div>
      ) : (
        <div className="space-y-1.5">
          {ordered.map(s => {
            const pctOfMax = (s.total_value / max) * 100;
            const pctOfTotal = total > 0 ? (s.total_value / total) * 100 : 0;
            return (
              <div key={s.status} className="relative rounded-md overflow-hidden border border-border/40">
                <div
                  className="absolute inset-y-0 left-0 transition-[width] duration-500"
                  style={{ width: `${pctOfMax}%`, backgroundColor: `${s.color}22` }}
                />
                <div className="relative flex items-center justify-between px-3 py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                    <span className="font-medium truncate">{s.label}</span>
                    <span className="text-muted-foreground text-[10px]">({s.count})</span>
                  </div>
                  <div className="flex items-baseline gap-2 shrink-0 tabular-nums">
                    <span className="font-semibold">{fmt(s.total_value)}</span>
                    <span className="text-[10px] text-muted-foreground w-9 text-right">{pctOfTotal.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
