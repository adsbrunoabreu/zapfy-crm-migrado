import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Headphones, Database, AlertOctagon } from 'lucide-react';
import type { AiKpis, AiModelDistribution, AiKbStats, AiBlockedCompany } from '@/hooks/useMasterAiData';

interface Props {
  kpis: AiKpis;
  models: AiModelDistribution[];
  kb: AiKbStats;
  blocked: AiBlockedCompany[];
}

function modelLabel(m: string) {
  // mostra só a parte final amigável
  if (!m || m === 'unknown') return 'Desconhecido';
  const parts = m.split('/');
  return parts[parts.length - 1] || m;
}

export function AiHealthCard({ kpis, models, kb, blocked }: Props) {
  const totalRuns = models.reduce((s, m) => s + m.runs, 0);
  const audioPct = kpis.runs > 0 ? Math.round((kpis.audios / kpis.runs) * 100) : 0;

  return (
    <Card className="animate-fade-in h-full w-full min-w-0 flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4 text-muted-foreground" />
          Saúde do Agente
        </CardTitle>
        <p className="text-xs text-muted-foreground">Modelos, erros, áudios e base de conhecimento</p>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 min-w-0">
        {/* Modelos */}
        <div className="space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Modelos usados</div>
          {models.length === 0 ? (
            <div className="text-sm text-muted-foreground">Sem execuções no período.</div>
          ) : (
            <div className="space-y-1.5">
              {models.slice(0, 4).map(m => {
                const pct = totalRuns > 0 ? (m.runs / totalRuns) * 100 : 0;
                return (
                  <div key={m.model}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium truncate mr-2">{modelLabel(m.model)}</span>
                      <span className="text-muted-foreground tabular-nums">{m.runs.toLocaleString('pt-BR')} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden mt-1">
                      <div className="h-full bg-[hsl(var(--violet))]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[hsl(var(--rose))]/15 flex items-center justify-center">
              <AlertOctagon className="w-4 h-4 text-[hsl(var(--rose))]" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Taxa de erro</div>
              <div className="text-sm font-semibold tabular-nums">{kpis.errorRate.toFixed(1)}%</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-[hsl(var(--cyan))]/15 flex items-center justify-center">
              <Headphones className="w-4 h-4 text-[hsl(var(--cyan))]" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Áudios</div>
              <div className="text-sm font-semibold tabular-nums">{audioPct}%</div>
            </div>
          </div>
        </div>

        <div className="pt-3 border-t border-border/60">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-muted-foreground" />
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Base de conhecimento</span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div>
              <div className="text-base font-semibold tabular-nums">{kb.total}</div>
              <div className="text-[10px] uppercase text-muted-foreground">Docs</div>
            </div>
            <div>
              <div className="text-base font-semibold tabular-nums text-[hsl(var(--emerald))]">{kb.ready}</div>
              <div className="text-[10px] uppercase text-muted-foreground">Ready</div>
            </div>
            <div>
              <div className="text-base font-semibold tabular-nums text-[hsl(var(--amber))]">{kb.processing}</div>
              <div className="text-[10px] uppercase text-muted-foreground">Proc.</div>
            </div>
            <div>
              <div className="text-base font-semibold tabular-nums text-[hsl(var(--rose))]">{kb.errors}</div>
              <div className="text-[10px] uppercase text-muted-foreground">Erro</div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {kb.companiesWithKb} empresa(s) · {kb.sizeMb} MB indexados
          </div>
        </div>

        {blocked.length > 0 && (
          <div className="pt-3 border-t border-border/60">
            <div className="text-[11px] uppercase tracking-wide text-[hsl(var(--rose))] font-medium mb-1.5">
              Bloqueadas por limite ({blocked.length})
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {blocked.slice(0, 5).map(b => (
                <div key={b.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{b.name}</span>
                  <span className="text-muted-foreground truncate ml-2">{b.blocked_reason || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
