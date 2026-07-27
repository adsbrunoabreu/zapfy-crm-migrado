import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Bot, ShieldAlert, AlertTriangle } from 'lucide-react';
import type { AiTopCompany } from '@/hooks/useMasterAiData';

interface Props {
  rows: AiTopCompany[];
}

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TopAiCompaniesTable({ rows }: Props) {
  return (
    <Card className="animate-fade-in h-full w-full min-w-0 flex flex-col">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="w-4 h-4 text-muted-foreground" />
          Top empresas por uso de IA
        </CardTitle>
        <p className="text-xs text-muted-foreground">Mensagens consumidas no período + projeção de fatura do add-on</p>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-w-0">
        {rows.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-muted-foreground">
            Nenhuma empresa usou o Agente IA no período.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Empresa</th>
                  <th className="text-right font-medium px-3 py-2">Mensagens</th>
                  <th className="text-right font-medium px-3 py-2">Limite</th>
                  <th className="text-right font-medium px-3 py-2">Overage</th>
                  <th className="text-right font-medium px-3 py-2">Latência</th>
                  <th className="text-right font-medium px-3 py-2">Fatura prevista</th>
                  <th className="text-center font-medium px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const usagePct = r.included > 0 ? Math.round((r.messages / r.included) * 100) : null;
                  const warn = usagePct !== null && usagePct >= 80 && usagePct < 100;
                  const over = usagePct !== null && usagePct >= 100;
                  return (
                    <tr key={r.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center text-xs font-semibold shrink-0">
                            {r.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.name}</div>
                            <div className="text-[11px] text-muted-foreground capitalize">{r.plan_status}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.messages.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {usagePct === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={over ? 'text-[hsl(var(--rose))] font-semibold' : warn ? 'text-[hsl(var(--amber))]' : ''}>
                            {usagePct}%
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {r.overage > 0 ? r.overage.toLocaleString('pt-BR') : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                        {r.avg_latency_ms > 0 ? `${Math.round(r.avg_latency_ms)} ms` : '—'}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-medium">
                        {r.addon_active ? formatBRL(r.projected_invoice) : <span className="text-muted-foreground">Sem add-on</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {r.blocked ? (
                          <Badge variant="destructive" className="gap-1">
                            <ShieldAlert className="w-3 h-3" /> Bloqueada
                          </Badge>
                        ) : over ? (
                          <Badge variant="outline" className="gap-1 border-[hsl(var(--rose))]/50 text-[hsl(var(--rose))]">
                            <AlertTriangle className="w-3 h-3" /> Excedeu
                          </Badge>
                        ) : warn ? (
                          <Badge variant="outline" className="gap-1 border-[hsl(var(--amber))]/50 text-[hsl(var(--amber))]">
                            <AlertTriangle className="w-3 h-3" /> Próx. limite
                          </Badge>
                        ) : r.addon_active ? (
                          <Badge variant="outline" className="border-[hsl(var(--emerald))]/40 text-[hsl(var(--emerald))]">Ativa</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Trial / sem add-on</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
