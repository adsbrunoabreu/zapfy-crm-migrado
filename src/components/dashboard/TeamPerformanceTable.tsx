import { useMemo, useState } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { TeamMemberPerf } from '@/hooks/useDashboardData';
import { InfoHint } from './InfoHint';

type SortKey = 'name' | 'total_leads' | 'converted' | 'conversion_rate' | 'avg_ticket' | 'avg_response_hours' | 'closed_won' | 'closed_lost' | 'win_rate_closed' | 'avg_cycle_days';

interface Props { team: TeamMemberPerf[]; }

function fmtCur(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function initials(name: string) {
  return name.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

export function TeamPerformanceTable({ team }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('conversion_rate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    const arr = [...team];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      let cmp = 0;
      if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [team, sortKey, sortDir]);

  const toggle = (k: SortKey) => {
    if (k === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'name' ? 'asc' : 'desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (k !== sortKey) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const Th = ({ k, label, align = 'left' }: { k: SortKey; label: string; align?: 'left' | 'right' }) => (
    <th
      onClick={() => toggle(k)}
      className={cn(
        'px-3 py-2.5 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors',
        align === 'right' ? 'text-right' : 'text-left'
      )}
    >
      <span className={cn('inline-flex items-center gap-1', align === 'right' && 'flex-row-reverse')}>
        {label}<SortIcon k={k} />
      </span>
    </th>
  );

  return (
    <Card className="p-4 lg:p-5 animate-fade-in">
      <div className="mb-4">
        <h3 className="text-base font-semibold inline-flex items-center gap-1.5">
          Desempenho da Equipe
          <InfoHint
            title="Desempenho da equipe"
            definition="Performance individual dos membros responsáveis pelos leads do período."
            formula="Conversão = leads_won / atribuídos × 100 · Ticket médio = receita / atribuídos"
            note="Status: Excelente > 20%, Normal 10–20%, Baixo < 10%."
          />
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">Performance individual no período</p>
      </div>

      {sorted.length === 0 ? (
        <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">
          Sem dados de equipe no período
        </div>
      ) : (
        <div className="overflow-x-auto -mx-4 lg:-mx-5">
          <table className="w-full text-sm">
            <thead className="border-y border-border/60">
              <tr>
                <Th k="name" label="Membro" />
                <Th k="total_leads" label="Atribuídos" align="right" />
                <Th k="converted" label="Convertidos" align="right" />
                <Th k="conversion_rate" label="Conversão" align="right" />
                <Th k="closed_won" label="Ganhos" align="right" />
                <Th k="closed_lost" label="Perdidos" align="right" />
                <Th k="win_rate_closed" label="Win rate" align="right" />
                <Th k="avg_cycle_days" label="Ciclo méd." align="right" />
                <Th k="avg_ticket" label="Ticket Médio" align="right" />
                <Th k="avg_response_hours" label="T. Resposta" align="right" />
                <th className="px-3 py-2.5 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => {
                const status: { v: 'success' | 'warning' | 'destructive'; l: string } =
                  m.win_rate_closed > 0
                    ? (m.win_rate_closed >= 50 ? { v: 'success', l: 'Excelente' } :
                       m.win_rate_closed >= 25 ? { v: 'warning', l: 'Normal' } :
                       { v: 'destructive', l: 'Baixo' })
                    : (m.conversion_rate > 20 ? { v: 'success', l: 'Excelente' } :
                       m.conversion_rate >= 10 ? { v: 'warning', l: 'Normal' } :
                       { v: 'destructive', l: 'Baixo' });
                return (
                  <tr
                    key={m.user_id ?? `na-${i}`}
                    className={cn(
                      'border-b border-border/40 last:border-0 transition-colors hover:bg-secondary/40',
                      i % 2 === 1 && 'bg-secondary/20'
                    )}
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar className="h-7 w-7 shrink-0">
                          {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                          <AvatarFallback className="text-[10px] bg-primary/15 text-primary font-semibold">
                            {initials(m.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{m.total_leads}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{m.converted}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {m.conversion_rate.toFixed(1)}%
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[hsl(var(--emerald))]">{m.closed_won}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-destructive">{m.closed_lost}</td>
                    <td className="px-3 py-3 text-right tabular-nums font-semibold">
                      {(m.closed_won + m.closed_lost) > 0 ? `${m.win_rate_closed.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                      {m.avg_cycle_days > 0 ? (m.avg_cycle_days < 1 ? `${Math.round(m.avg_cycle_days * 24)}h` : `${m.avg_cycle_days.toFixed(1)}d`) : '—'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{fmtCur(m.avg_ticket)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">
                      {m.responded_count > 0
                        ? (m.avg_response_hours >= 1
                            ? `${m.avg_response_hours.toFixed(1)}h`
                            : `${Math.round(m.avg_response_hours * 60)}min`)
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Badge variant={status.v as any} className="text-[10px]">{status.l}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
