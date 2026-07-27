import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  CalendarIcon,
  DollarSign,
  Loader2,
  MessageSquare,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRankings, type RankingMetric, type RankingRow } from '@/hooks/useRankings';
import { metricValue } from '@/hooks/useRankings';
import { RankingPodium } from './RankingPodium';
import { RankingHighlights } from './RankingHighlights';
import { RankingTable } from './RankingTable';

type PeriodKey = 'this_month' | 'last_month' | 'last_3_months' | 'year' | 'custom';

function periodRange(key: PeriodKey, custom?: { start?: Date; end?: Date }): { start: string; end: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  if (key === 'this_month') {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: fmt(s), end: fmt(e) };
  }
  if (key === 'last_month') {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: fmt(s), end: fmt(e) };
  }
  if (key === 'last_3_months') {
    const s = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { start: fmt(s), end: fmt(e) };
  }
  if (key === 'year') {
    const s = new Date(now.getFullYear(), 0, 1);
    const e = new Date(now.getFullYear(), 11, 31);
    return { start: fmt(s), end: fmt(e) };
  }
  // custom
  const s = custom?.start ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const e = custom?.end ?? new Date();
  return { start: fmt(s), end: fmt(e) };
}

const periodOptions: { key: PeriodKey; label: string }[] = [
  { key: 'this_month', label: 'Mês atual' },
  { key: 'last_month', label: 'Mês anterior' },
  { key: 'last_3_months', label: 'Últimos 3 meses' },
  { key: 'year', label: 'Ano' },
  { key: 'custom', label: 'Personalizado' },
];

const metricOptions: { key: RankingMetric; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'value', label: 'Valor faturado', icon: DollarSign, color: 'text-emerald' },
  { key: 'conversions', label: 'Conversões', icon: Zap, color: 'text-amber' },
  { key: 'leads', label: 'Leads atribuídos', icon: Users, color: 'text-primary' },
  { key: 'responses', label: 'Mensagens enviadas', icon: MessageSquare, color: 'text-cyan' },
];

export function RankingsTab() {
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [metric, setMetric] = useState<RankingMetric>('value');
  const [customStart, setCustomStart] = useState<Date | undefined>(undefined);
  const [customEnd, setCustomEnd] = useState<Date | undefined>(undefined);

  const { start, end } = useMemo(
    () => periodRange(period, { start: customStart, end: customEnd }),
    [period, customStart, customEnd],
  );

  const { data: rows = [], isLoading } = useRankings(start, end);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => metricValue(b, metric) - metricValue(a, metric));
  }, [rows, metric]);

  const activeMetric = metricOptions.find((m) => m.key === metric)!;
  const totalValue = sortedRows.reduce((sum, r) => sum + metricValue(r, metric), 0);

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card className="p-4 border-zinc-800">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">
              Período
            </span>
            {periodOptions.map((p) => (
              <Button
                key={p.key}
                variant={period === p.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPeriod(p.key)}
                className="h-8"
              >
                {p.label}
              </Button>
            ))}
            {period === 'custom' && (
              <div className="flex gap-2 ml-2">
                <DatePopover label="De" date={customStart} onSelect={setCustomStart} />
                <DatePopover label="Até" date={customEnd} onSelect={setCustomEnd} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs uppercase tracking-wider text-muted-foreground mr-1">
              Categoria
            </span>
            {metricOptions.map((m) => {
              const Icon = m.icon;
              const active = metric === m.key;
              return (
                <Button
                  key={m.key}
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMetric(m.key)}
                  className={cn('h-8 gap-1.5', !active && m.color)}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {m.label}
                </Button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Resumo */}
      <Card className="p-4 border-zinc-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center bg-secondary', activeMetric.color)}>
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Total da equipe no período
              </p>
              <p className="text-2xl font-bold">
                {metric === 'value'
                  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)
                  : new Intl.NumberFormat('pt-BR').format(totalValue)}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {format(parseISO(start), "dd 'de' MMM", { locale: ptBR })} —{' '}
            {format(parseISO(end), "dd 'de' MMM yyyy", { locale: ptBR })}
          </p>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : sortedRows.length === 0 ? (
        <Card className="p-12 text-center border-zinc-800">
          <Trophy className="w-12 h-12 mx-auto mb-3 text-muted-foreground/40" />
          <h3 className="text-lg font-semibold mb-1">Sem dados no período</h3>
          <p className="text-sm text-muted-foreground">
            Quando seus agentes começarem a movimentar leads, eles aparecerão aqui.
          </p>
        </Card>
      ) : (
        <>
          <RankingPodium rows={sortedRows} metric={metric} />
          <RankingHighlights rows={sortedRows} metric={metric} periodStart={start} />
          <RankingTable rows={sortedRows} metric={metric} />
          <p className="text-[11px] text-muted-foreground text-center">
            Ranking atualizado em tempo real conforme os leads e mensagens são registrados.
            As estrelas refletem o atingimento da meta vigente (ou da liderança quando não há meta).
          </p>
        </>
      )}
    </div>
  );
}

function DatePopover({
  label,
  date,
  onSelect,
}: {
  label: string;
  date?: Date;
  onSelect: (d?: Date) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('h-8', !date && 'text-muted-foreground')}>
          <CalendarIcon className="w-3.5 h-3.5 mr-1.5" />
          {date ? format(date, 'dd/MM/yyyy') : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          initialFocus
          className={cn('p-3 pointer-events-auto')}
        />
      </PopoverContent>
    </Popover>
  );
}
