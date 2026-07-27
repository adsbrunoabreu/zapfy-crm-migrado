import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, TrendingUp, ArrowUpRight, Settings2, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { AtRiskRow, UpsellRow } from '@/hooks/useMasterDashboardData';

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function severityColor(score: number) {
  if (score >= 80) return 'text-[hsl(var(--rose))]';
  if (score >= 65) return 'text-[hsl(var(--rose))]';
  if (score >= 35) return 'text-[hsl(var(--amber))]';
  return 'text-muted-foreground';
}

function ScoreBreakdown({ row }: { row: AtRiskRow }) {
  // Soma das contribuições brutas para % de "peso no score"
  const totalContribution = row.factors.reduce((s, f) => s + f.contribution, 0) || 1;

  return (
    <div className="w-80 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{row.name}</p>
          <p className="text-xs text-muted-foreground">Score de risco</p>
        </div>
        <div className={`text-2xl font-bold tabular-nums ${severityColor(row.score)}`}>
          {row.score}
          <span className="text-xs text-muted-foreground font-normal">/100</span>
        </div>
      </div>

      <Progress value={row.score} className="h-1.5" />

      <div className="pt-2 border-t border-border/60">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
          Fatores e pesos
        </p>
        {row.factors.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem fatores ativos.</p>
        ) : (
          <ul className="space-y-2">
            {row.factors.map(f => {
              const sharePct = (f.contribution / totalContribution) * 100;
              return (
                <li key={f.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{f.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      peso {f.weight} · {Math.round(sharePct)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-snug">{f.description}</p>
                  <Progress value={f.intensity * 100} className="h-1" />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="pt-2 border-t border-border/60 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="text-muted-foreground">Leads</p>
          <p className="font-medium tabular-nums">{row.leadsPeriod} <span className="text-muted-foreground">/ {row.leadsPrev}</span></p>
        </div>
        <div>
          <p className="text-muted-foreground">MRR</p>
          <p className="font-medium tabular-nums">{formatBRL(row.mrr)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Última atividade</p>
          <p className="font-medium tabular-nums">
            {row.daysSinceLastLead === null ? '—' : `${row.daysSinceLastLead}d`}
          </p>
        </div>
      </div>
    </div>
  );
}

export function OpportunitiesCard({
  atRisk, upsell, onConfigureRisk,
}: {
  atRisk: AtRiskRow[];
  upsell: UpsellRow[];
  onConfigureRisk?: () => void;
}) {
  const totalUpsell = upsell.reduce((s, u) => s + u.potential, 0);

  return (
    <Card className="animate-fade-in">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Oportunidades & Riscos</CardTitle>
        {onConfigureRisk && (
          <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onConfigureRisk}>
            <Settings2 className="w-3.5 h-3.5" />
            Configurar risco
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Upsell */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--emerald))]">
              <TrendingUp className="w-4 h-4" />
              Potencial de upsell
            </div>
            <span className="text-sm font-bold tabular-nums text-[hsl(var(--emerald))]">+{formatBRL(totalUpsell)}/mês</span>
          </div>
          {upsell.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma oportunidade detectada no período.</p>
          ) : (
            <div className="space-y-2">
              {upsell.slice(0, 5).map(u => (
                <Link key={u.id} to={`/admin/companies?id=${u.id}`}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card/50 hover:bg-secondary/40 transition-colors group">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded ${
                        u.category === 'hot'
                          ? 'bg-[hsl(var(--emerald))]/15 text-[hsl(var(--emerald))]'
                          : 'bg-[hsl(var(--cyan))]/15 text-[hsl(var(--cyan))]'
                      }`}>{u.score}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.currentPlanName} → {u.targetPlanName} · {u.leads} leads</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-medium text-[hsl(var(--emerald))]">
                    +{formatBRL(u.potential)}
                    <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* At-risk */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-[hsl(var(--amber))]">
              <AlertTriangle className="w-4 h-4" />
              Contas em risco
            </div>
            <span className="text-xs text-muted-foreground">{atRisk.length}</span>
          </div>
          {atRisk.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma conta em risco identificada. 🎉</p>
          ) : (
            <div className="space-y-2">
              {atRisk.map(r => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between p-3 rounded-lg border bg-card/50 hover:bg-secondary/40 transition-colors group ${
                    r.severity === 'high' ? 'border-[hsl(var(--rose))]/30' : 'border-[hsl(var(--amber))]/30'
                  }`}
                >
                  <Link to={`/admin/companies?id=${r.id}`} className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{r.name}</p>
                      <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded ${
                        r.severity === 'high'
                          ? 'bg-[hsl(var(--rose))]/15 text-[hsl(var(--rose))]'
                          : 'bg-[hsl(var(--amber))]/15 text-[hsl(var(--amber))]'
                      }`}>
                        {r.score}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.reason}</p>
                  </Link>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        className="ml-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                        aria-label="Ver fatores do score"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-auto p-4">
                      <ScoreBreakdown row={r} />
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
