import { Card } from '@/components/ui/card';
import { XCircle } from 'lucide-react';
import { formatBRL } from '@/lib/format';
import { InfoHint } from './InfoHint';
import type { LossReasonAgg } from '@/lib/dashboardMetrics';

interface Props {
  reasons: LossReasonAgg[];
  totalLost: number;
  totalLostValue: number;
}

export function LossReasonsCard({ reasons, totalLost, totalLostValue }: Props) {
  const top = reasons.slice(0, 8);
  return (
    <Card className="p-4 lg:p-5 animate-fade-in h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
            Motivos de Perda
            <InfoHint
              title="Motivos de Perda"
              definition="Distribuição dos motivos registrados nos leads marcados como perdido (closed_at no período)."
              formula="COUNT(leads) por loss_reason_id (ou texto livre)"
              note="Configure motivos em Configurações → Pipeline → Motivos de perda."
            />
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {totalLost} leads perdidos · {formatBRL(totalLostValue)} em pipeline
          </p>
        </div>
        <div className="w-9 h-9 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
          <XCircle className="w-4 h-4" />
        </div>
      </div>

      {top.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground py-8">
          Nenhuma perda registrada no período
        </div>
      ) : (
        <ul className="space-y-3 flex-1">
          {top.map((r) => (
            <li key={r.reason_id ?? r.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate font-medium">{r.label}</span>
                <span className="tabular-nums text-muted-foreground shrink-0">
                  {r.count} · {r.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-destructive/70"
                  style={{ width: `${Math.min(100, r.percentage)}%` }}
                />
              </div>
              {r.total_value > 0 && (
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {formatBRL(r.total_value)} perdidos
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
