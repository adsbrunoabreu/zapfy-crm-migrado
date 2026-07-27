import { Card } from '@/components/ui/card';
import { Trophy, XCircle, RotateCcw, Target } from 'lucide-react';
import { InfoHint } from './InfoHint';
import type { ClosingsKpi } from '@/lib/dashboardMetrics';
import { formatBRL } from '@/lib/format';

interface Props {
  closings: ClosingsKpi;
  reopenedCount: number;
}

/**
 * Funil de desfechos baseado em closed_at:
 * Total fechado → Ganhos / Perdidos · Reaberturas como evento paralelo.
 * Substitui o antigo "Funil de Conversão" (eixo de criação) pelo eixo de saída do pipeline.
 */
export function OutcomesFunnel({ closings, reopenedCount }: Props) {
  const c = closings;
  const closed = c.closedCount;
  const wonPct = closed > 0 ? (c.wonCount / closed) * 100 : 0;
  const lostPct = closed > 0 ? (c.lostCount / closed) * 100 : 0;

  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
          Funil de Desfechos
          <InfoHint
            title="Funil de desfechos"
            definition="Distribui os leads fechados no período entre Ganhos e Perdidos (closed_at). Reaberturas aparecem como evento paralelo (lead_activities)."
            formula="Win Rate = ganhos / (ganhos + perdidos) · Loss Rate = perdidos / (ganhos + perdidos)"
            note="Substitui o funil antigo, que considerava leads criados em cada estágio."
          />
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {closed.toLocaleString('pt-BR')} leads fechados · {reopenedCount} reaberturas
        </p>
      </div>

      {closed === 0 && reopenedCount === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Sem fechamentos no período
        </div>
      ) : (
        <div className="flex-1 space-y-3">
          {/* Total fechado */}
          <div className="rounded-lg border border-border bg-secondary/30 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" /> Total fechado
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {closed.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden flex">
              <div
                className="h-full bg-[hsl(var(--emerald))]"
                style={{ width: `${wonPct}%` }}
              />
              <div
                className="h-full bg-destructive"
                style={{ width: `${lostPct}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>Ganhos {wonPct.toFixed(1)}%</span>
              <span>Perdidos {lostPct.toFixed(1)}%</span>
            </div>
          </div>

          {/* Ganhos */}
          <div className="rounded-lg border border-[hsl(var(--emerald))]/30 bg-[hsl(var(--emerald))]/10 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs inline-flex items-center gap-1.5 text-[hsl(var(--emerald))]">
                <Trophy className="w-3.5 h-3.5" /> Ganhos
              </span>
              <span className="text-sm font-semibold tabular-nums text-[hsl(var(--emerald))]">
                {c.wonCount.toLocaleString('pt-BR')} · {wonPct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {formatBRL(c.wonRevenue)} em receita
            </div>
          </div>

          {/* Perdidos */}
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs inline-flex items-center gap-1.5 text-destructive">
                <XCircle className="w-3.5 h-3.5" /> Perdidos
              </span>
              <span className="text-sm font-semibold tabular-nums text-destructive">
                {c.lostCount.toLocaleString('pt-BR')} · {lostPct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {formatBRL(c.lostRevenue)} em pipeline perdido
            </div>
          </div>

          {/* Reaberturas (evento paralelo) */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs inline-flex items-center gap-1.5 text-primary">
                <RotateCcw className="w-3.5 h-3.5" /> Reaberturas
              </span>
              <span className="text-sm font-semibold tabular-nums text-primary">
                {reopenedCount.toLocaleString('pt-BR')}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              Eventos de lead_reopened registrados no período
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
