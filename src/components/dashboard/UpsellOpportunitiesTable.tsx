import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp, Settings2, ArrowUpRight, Flame, Sparkles, Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { UpsellRow } from '@/hooks/useMasterDashboardData';

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0,
  });
}

function UsageBar({ used, max }: { used: number; max: number | null }) {
  if (!max) return <span className="text-xs text-muted-foreground tabular-nums">{used} / ∞</span>;
  const pct = Math.min(100, (used / max) * 100);
  const color =
    pct >= 90 ? 'text-[hsl(var(--rose))]' :
    pct >= 70 ? 'text-[hsl(var(--amber))]' :
                'text-muted-foreground';
  return (
    <div className="w-full min-w-[90px]">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className={`tabular-nums ${color}`}>{used}/{max}</span>
        <span className={`tabular-nums ${color}`}>{Math.round(pct)}%</span>
      </div>
      <Progress value={pct} className="h-1" />
    </div>
  );
}

function FactorsPopover({ row }: { row: UpsellRow }) {
  const total = row.factors.reduce((s, f) => s + f.contribution, 0) || 1;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          aria-label="Ver justificativa"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">{row.name}</p>
              <p className="text-xs text-muted-foreground">Justificativa do score</p>
            </div>
            <div className={`text-2xl font-bold tabular-nums ${
              row.category === 'hot' ? 'text-[hsl(var(--emerald))]' : 'text-[hsl(var(--cyan))]'
            }`}>
              {row.score}<span className="text-xs text-muted-foreground font-normal">/100</span>
            </div>
          </div>
          <Progress value={row.score} className="h-1.5" />
          <div className="pt-2 border-t border-border/60">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
              Sinais detectados
            </p>
            {row.factors.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem sinais relevantes.</p>
            ) : (
              <ul className="space-y-2">
                {row.factors.map(f => {
                  const sharePct = (f.contribution / total) * 100;
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
        </div>
      </PopoverContent>
    </Popover>
  );
}

type Filter = 'all' | 'hot' | 'warm';

export function UpsellOpportunitiesTable({
  rows, onConfigure,
}: {
  rows: UpsellRow[];
  onConfigure?: () => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter(r => r.category === filter);
  }, [rows, filter]);

  const totalsAll = useMemo(() => ({
    monthly: rows.reduce((s, r) => s + r.potential, 0),
    annual: rows.reduce((s, r) => s + r.potentialAnnual, 0),
    count: rows.length,
    hot: rows.filter(r => r.category === 'hot').length,
  }), [rows]);

  return (
    <Card className="animate-fade-in">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-4 h-4 text-[hsl(var(--emerald))]" />
            Previsão de upsell · oportunidades detectadas
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            <span className="text-[hsl(var(--emerald))] font-semibold">{totalsAll.count}</span> empresa(s) sinalizada(s) ·
            potencial de <span className="text-[hsl(var(--emerald))] font-semibold tabular-nums">+{formatBRL(totalsAll.monthly)}/mês</span>{' '}
            (<span className="tabular-nums">+{formatBRL(totalsAll.annual)}/ano</span>) ·
            <Flame className="inline w-3 h-3 ml-1 text-[hsl(var(--emerald))]" /> {totalsAll.hot} hot
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ToggleGroup
            type="single" size="sm" value={filter}
            onValueChange={(v) => v && setFilter(v as Filter)}
          >
            <ToggleGroupItem value="all" className="h-7 text-xs px-2">Todos</ToggleGroupItem>
            <ToggleGroupItem value="hot" className="h-7 text-xs px-2">Hot</ToggleGroupItem>
            <ToggleGroupItem value="warm" className="h-7 text-xs px-2">Warm</ToggleGroupItem>
          </ToggleGroup>
          {onConfigure && (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={onConfigure}>
              <Settings2 className="w-3.5 h-3.5" />
              Configurar
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-0">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            Nenhuma oportunidade {filter !== 'all' ? `(${filter}) ` : ''}detectada no período.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[60px] text-center">Score</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Sugestão</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="min-w-[120px]">Uso de leads</TableHead>
                  <TableHead className="min-w-[120px]">WhatsApp</TableHead>
                  <TableHead>Justificativa principal</TableHead>
                  <TableHead className="text-right">Potencial</TableHead>
                  <TableHead className="w-[40px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id} className="group">
                    <TableCell className="text-center">
                      <span className={`inline-flex items-center justify-center text-xs font-bold tabular-nums w-9 h-9 rounded-full ${
                        r.category === 'hot'
                          ? 'bg-[hsl(var(--emerald))]/15 text-[hsl(var(--emerald))]'
                          : 'bg-[hsl(var(--cyan))]/15 text-[hsl(var(--cyan))]'
                      }`}>
                        {r.score}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Link to={`/admin/companies?id=${r.id}`} className="hover:underline">
                        <div className="text-sm font-medium">{r.name}</div>
                        <div className="text-[11px] text-muted-foreground">{r.currentPlanName}</div>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-muted-foreground">→</span>
                        <span className="font-medium">{r.targetPlanName}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {formatBRL(r.currentMrr)} → {formatBRL(r.targetMrr)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-sm font-medium tabular-nums">{r.leads}</div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        {r.leadsPrev > 0
                          ? (r.leads >= r.leadsPrev
                              ? <span className="text-[hsl(var(--emerald))]">+{Math.round(((r.leads - r.leadsPrev) / r.leadsPrev) * 100)}%</span>
                              : <span>{Math.round(((r.leads - r.leadsPrev) / r.leadsPrev) * 100)}%</span>)
                          : '—'}
                      </div>
                    </TableCell>
                    <TableCell><UsageBar used={r.leadsUsage.used} max={r.leadsUsage.max} /></TableCell>
                    <TableCell><UsageBar used={r.whatsappUsage.used} max={r.whatsappUsage.max} /></TableCell>
                    <TableCell className="max-w-[260px]">
                      <p className="text-xs text-muted-foreground line-clamp-2">{r.topReason}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.factors.slice(0, 3).map(f => (
                          <span key={f.key} className="text-[9px] px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground">
                            {f.label}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="text-sm font-bold tabular-nums text-[hsl(var(--emerald))]">
                        +{formatBRL(r.potential)}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        +{formatBRL(r.potentialAnnual)}/ano
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <FactorsPopover row={r} />
                        <Link
                          to={`/admin/companies?id=${r.id}`}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Abrir empresa"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
