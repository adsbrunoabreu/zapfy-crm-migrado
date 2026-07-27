import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InfoHint } from './InfoHint';
import { Activity, CheckCircle2, AlertCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MasterDashboardKpis } from '@/hooks/useMasterDashboardData';

interface Props {
  kpis: MasterDashboardKpis;
  periodLabel: string;
}

/**
 * Tabela compacta de Status de Atividade — pareada com TopCompaniesTable na seção 3.
 * Mostra distribuição de empresas por status + métricas de engajamento agregadas.
 */
export function ActivityStatusTable({ kpis, periodLabel }: Props) {
  const total = kpis.totalCompanies || 1;
  const activeCompaniesUsing = Math.round((kpis.utilizationRate / 100) * kpis.totalCompanies);

  const rows = [
    {
      label: 'Ativas',
      value: kpis.activeCompanies,
      pct: (kpis.activeCompanies / total) * 100,
      icon: CheckCircle2,
      color: 'text-[hsl(var(--emerald))]',
      bg: 'bg-[hsl(var(--emerald))]/15',
      bar: 'bg-[hsl(var(--emerald))]',
    },
    {
      label: 'Em trial',
      value: kpis.trialCompanies,
      pct: (kpis.trialCompanies / total) * 100,
      icon: Clock,
      color: 'text-[hsl(var(--amber))]',
      bg: 'bg-[hsl(var(--amber))]/15',
      bar: 'bg-[hsl(var(--amber))]',
    },
    {
      label: 'Suspensas',
      value: kpis.suspendedCompanies,
      pct: (kpis.suspendedCompanies / total) * 100,
      icon: AlertCircle,
      color: 'text-[hsl(var(--rose))]',
      bg: 'bg-[hsl(var(--rose))]/15',
      bar: 'bg-[hsl(var(--rose))]',
    },
    {
      label: 'Canceladas',
      value: kpis.canceledCompanies,
      pct: (kpis.canceledCompanies / total) * 100,
      icon: XCircle,
      color: 'text-muted-foreground',
      bg: 'bg-muted',
      bar: 'bg-muted-foreground/40',
    },
    {
      label: 'Engajadas no período',
      value: activeCompaniesUsing,
      pct: kpis.utilizationRate,
      icon: Activity,
      color: 'text-[hsl(var(--cyan))]',
      bg: 'bg-[hsl(var(--cyan))]/15',
      bar: 'bg-[hsl(var(--cyan))]',
      highlight: true,
    },
  ];

  return (
    <Card className="animate-fade-in h-full w-full min-w-0 flex flex-col">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-1.5">
            Status de atividade
            <InfoHint
              title="Status de atividade"
              definition="Distribuição das empresas por status de assinatura e nível de utilização agregado da plataforma."
              formula="Utilização % = empresas_ativamente_usando / total_empresas × 100"
              note="Status: active, trial, past_due, suspended, canceled."
            />
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">{periodLabel}</p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{kpis.totalCompanies} empresas</span>
      </CardHeader>
      <CardContent className="flex-1 p-0 min-w-0">
        <div className="divide-y divide-border/60">
          {rows.map((r) => (
            <div
              key={r.label}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5',
                r.highlight && 'bg-secondary/30',
              )}
            >
              <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', r.bg)}>
                <r.icon className={cn('w-3.5 h-3.5', r.color)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium truncate">{r.label}</span>
                  <span className="tabular-nums font-semibold">{r.value.toLocaleString('pt-BR')}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', r.bar)}
                      style={{ width: `${Math.min(100, r.pct)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums w-12 text-right">
                    {r.pct.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
