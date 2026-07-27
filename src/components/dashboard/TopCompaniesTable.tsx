import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, TrendingUp, TrendingDown, ArrowUpDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { TopCompanyRow } from '@/hooks/useMasterDashboardData';
import { InfoHint } from './InfoHint';

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('') || '?';
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: 'Ativo', cls: 'bg-[hsl(var(--emerald))]/15 text-[hsl(var(--emerald))] border-[hsl(var(--emerald))]/30' },
  trial: { label: 'Trial', cls: 'bg-[hsl(var(--amber))]/15 text-[hsl(var(--amber))] border-[hsl(var(--amber))]/30' },
  suspended: { label: 'Suspenso', cls: 'bg-[hsl(var(--rose))]/15 text-[hsl(var(--rose))] border-[hsl(var(--rose))]/30' },
  cancelled: { label: 'Cancelado', cls: 'bg-muted text-muted-foreground border-border' },
};

type SortKey = 'name' | 'leadsPeriod' | 'mrr' | 'arr' | 'created_at';

export function TopCompaniesTable({ rows }: { rows: TopCompanyRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('mrr');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...rows].sort((a, b) => {
    let av: any = (a as any)[sortKey];
    let bv: any = (b as any)[sortKey];
    if (sortKey === 'created_at') { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
    if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const Th = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <th className={cn('text-left text-[11px] uppercase tracking-wide text-muted-foreground font-medium pb-2 px-3', className)}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
        {label} <ArrowUpDown className="w-3 h-3 opacity-50" />
      </button>
    </th>
  );

  return (
    <Card className="animate-fade-in h-full w-full min-w-0 flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-1.5">
          Top empresas
          <InfoHint
            title="Top empresas"
            definition="Empresas ordenadas por receita (MRR/ARR) com leads gerados no período. A seta indica se geraram mais ou menos leads que no período anterior."
            formula="MRR_empresa = valor mensal da assinatura · Leads = COUNT(leads no período)"
          />
        </CardTitle>
        <Link to="/admin/companies" className="text-xs text-primary hover:underline">Ver todas →</Link>
      </CardHeader>
      <CardContent className="p-0 flex-1 min-w-0">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Sem dados ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <Th k="name" label="Empresa" />
                  <Th k="leadsPeriod" label="Leads" className="text-right" />
                  <Th k="mrr" label="MRR" className="text-right" />
                  <Th k="arr" label="ARR" className="text-right" />
                  <Th k="created_at" label="Signup" className="text-right" />
                  <th className="text-right text-[11px] uppercase tracking-wide text-muted-foreground font-medium pb-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => {
                  const sb = STATUS_BADGE[r.plan_status] || STATUS_BADGE.cancelled;
                  const trendUp = r.leadsPeriod > r.leadsPrev;
                  const trendDown = r.leadsPeriod < r.leadsPrev;
                  return (
                    <tr key={r.id} className={cn('border-b border-border/40 last:border-0', i % 2 === 1 && 'bg-secondary/20')}>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {r.logo_url ? (
                            <img src={r.logo_url} alt="" className="w-7 h-7 rounded-md object-cover" />
                          ) : (
                            <div className="w-7 h-7 rounded-md bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold">
                              {initials(r.name)}
                            </div>
                          )}
                          <span className="font-medium truncate">{r.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1 tabular-nums">
                          {r.leadsPeriod}
                          {trendUp && <TrendingUp className="w-3 h-3 text-[hsl(var(--emerald))]" />}
                          {trendDown && <TrendingDown className="w-3 h-3 text-[hsl(var(--rose))]" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatBRL(r.mrr)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">{formatBRL(r.arr)}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                        {new Date(r.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Badge variant="outline" className={sb.cls}>{sb.label}</Badge>
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
