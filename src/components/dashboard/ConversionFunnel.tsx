import { Card } from '@/components/ui/card';
import type { StageBreakdown } from '@/hooks/useDashboardData';
import { InfoHint } from './InfoHint';

interface Props { stages: StageBreakdown[]; }

export function ConversionFunnel({ stages }: Props) {
  // Funil = estágios "open" + "won" na ordem do pipeline (descarta "lost" e "unassigned")
  const items = [...stages]
    .filter(s => s.stage_type === 'open' || s.stage_type === 'won')
    .sort((a, b) => a.position - b.position);
  const baseCount = items[0]?.count || 0;

  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
          Funil de Conversão
          <InfoHint
            title="Funil de conversão"
            definition="Mostra quantos leads avançam de um estágio para o seguinte. A conversão de cada estágio é relativa ao estágio anterior."
            formula="Conv. estágio = (leads estágio atual / leads estágio anterior) × 100"
            note="A barra principal usa como base 100% o primeiro estágio (Novo)."
          />
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">Conversão entre estágios</p>
      </div>
      {baseCount === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
          Sem dados no período
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((s, i) => {
            const widthPct = baseCount > 0 ? Math.max(8, (s.count / baseCount) * 100) : 0;
            const prev = i > 0 ? items[i - 1] : null;
            const stageConvPct = prev && prev.count > 0
              ? Math.round((s.count / prev.count) * 100)
              : 100;
            return (
              <div key={s.status} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {s.count} leads · <span className="text-foreground font-semibold">{stageConvPct}%</span>
                  </span>
                </div>
                <div className="h-8 rounded-md bg-secondary/40 overflow-hidden">
                  <div
                    className="h-full rounded-md transition-[width] duration-500 ease-out flex items-center justify-end px-2.5"
                    style={{
                      width: `${widthPct}%`,
                      background: `linear-gradient(90deg, ${s.color}cc, ${s.color})`,
                    }}
                  >
                    {widthPct > 25 && (
                      <span className="text-[10px] font-semibold text-white drop-shadow">
                        {Math.round((s.count / baseCount) * 100)}%
                      </span>
                    )}
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
