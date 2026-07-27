import { MetricCard } from '@/components/ui/metric-card';
import { Trophy, Layers, TrendingUp, Wallet, Timer, Coins, Receipt, BadgeDollarSign, XCircle, Filter } from 'lucide-react';
import { formatBRL } from '@/lib/format';
import { InfoHint } from '@/components/dashboard/InfoHint';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { PipelineReportKpis } from '@/hooks/usePipelinePerformance';

function formatDays(d: number | null | undefined): string {
  if (d == null) return '—';
  if (d < 1) return `${Math.round(d * 24)}h`;
  return `${d.toFixed(1)}d`;
}

interface Props {
  kpis: PipelineReportKpis | undefined;
  prevKpis?: PipelineReportKpis | undefined;
}

function winRateOf(k: PipelineReportKpis | undefined): number | null {
  const closed = k?.closed ?? 0;
  if (closed <= 0) return null;
  return ((k!.won ?? 0) / closed) * 100;
}

function funnelRateOf(k: PipelineReportKpis | undefined): number | null {
  const total = k?.total_leads ?? 0;
  if (total <= 0) return null;
  return ((k!.won ?? 0) / total) * 100;
}

function pctDelta(curr: number | null | undefined, prev: number | null | undefined): { value: number; label?: string } | undefined {
  if (curr == null || prev == null) return undefined;
  if (prev === 0) {
    if (curr === 0) return { value: 0, label: 'vs anterior' };
    return { value: 100, label: 'vs anterior' };
  }
  return { value: ((curr - prev) / Math.abs(prev)) * 100, label: 'vs anterior' };
}

interface HintProps { title: string; definition: string; formula?: string; note?: string }
function L({ text, hint }: { text: string; hint: HintProps }) {
  return (
    <span className="inline-flex items-center gap-1">
      {text}
      <InfoHint {...hint} />
    </span>
  );
}

export function ReportKpiHeader({ kpis, prevKpis }: Props) {
  const winRate = winRateOf(kpis);
  const prevWinRate = winRateOf(prevKpis);
  const funnelRate = funnelRateOf(kpis);
  const prevFunnelRate = funnelRateOf(prevKpis);

  return (
    <TooltipProvider delayDuration={150}>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Bloco 1 — Resultado financeiro */}
        <MetricCard
          label={<L text="Receita total do funil" hint={{
            title: 'Receita total do funil',
            definition: 'Soma do valor de todas as oportunidades criadas no período (independente do status).',
            formula: 'Σ value WHERE created_at BETWEEN período',
            note: 'Mostra o tamanho total do funil gerado no período.',
          }} />}
          value={formatBRL(kpis?.pipeline_value ?? 0, { fraction: true })}
          icon={<Coins />}
          delta={pctDelta(kpis?.pipeline_value, prevKpis?.pipeline_value)}
        />
        <MetricCard
          label={<L text="Receita ganha" hint={{
            title: 'Receita ganha',
            definition: 'Soma do valor dos leads marcados como ganhos cujo fechamento (closed_at) caiu no período.',
            formula: 'Σ value WHERE status = won AND closed_at BETWEEN período',
          }} />}
          value={formatBRL(kpis?.revenue_won ?? 0, { fraction: true })}
          icon={<Wallet />}
          delta={pctDelta(kpis?.revenue_won, prevKpis?.revenue_won)}
        />
        <MetricCard
          label={<L text="Ticket médio por oportunidade" hint={{
            title: 'Ticket médio por oportunidade',
            definition: 'Valor médio considerando todas as oportunidades criadas no período com valor preenchido (independente do status).',
            formula: 'AVG(value) WHERE created_at BETWEEN período AND value IS NOT NULL',
          }} />}
          value={kpis?.avg_ticket_all ? formatBRL(kpis.avg_ticket_all, { fraction: true }) : '—'}
          icon={<Receipt />}
          delta={pctDelta(kpis?.avg_ticket_all, prevKpis?.avg_ticket_all)}
        />
        <MetricCard
          label={<L text="Ticket médio ganho" hint={{
            title: 'Ticket médio ganho',
            definition: 'Valor médio dos leads ganhos com valor preenchido no período.',
            formula: 'receita_ganha / nº de ganhos com valor',
          }} />}
          value={kpis?.avg_ticket_won ? formatBRL(kpis.avg_ticket_won, { fraction: true }) : '—'}
          icon={<BadgeDollarSign />}
          delta={pctDelta(kpis?.avg_ticket_won, prevKpis?.avg_ticket_won)}
        />
        {/* Bloco 2 — Eficiência (parte 1) */}
        <MetricCard
          label={<L text="Taxa de conversão" hint={{
            title: 'Taxa de conversão (fechados)',
            definition: '% de leads fechados que viraram ganho no período (eixo closed_at).',
            formula: 'won / (won + lost) × 100',
            note: 'Mede eficácia entre oportunidades já desfechadas. Variação em pontos percentuais (p.p.).',
          }} />}
          value={winRate == null ? '—' : `${Math.round(winRate)}%`}
          icon={<TrendingUp />}
          delta={winRate != null && prevWinRate != null ? { value: winRate - prevWinRate, label: 'p.p. vs anterior' } : undefined}
        />
        {/* Bloco 2 — Eficiência (parte 2) */}
        <MetricCard
          label={<L text="Aproveitamento do funil" hint={{
            title: 'Taxa de aproveitamento do funil',
            definition: '% de oportunidades criadas no período que viraram ganho. Indicador mais severo: considera também leads ainda em aberto.',
            formula: 'won / total_oportunidades_no_período × 100',
            note: 'Diferença para a "Taxa de conversão" indica volume preso no funil. Variação em p.p.',
          }} />}
          value={funnelRate == null ? '—' : `${Math.round(funnelRate)}%`}
          icon={<Filter />}
          delta={funnelRate != null && prevFunnelRate != null ? { value: funnelRate - prevFunnelRate, label: 'p.p. vs anterior' } : undefined}
        />
        <MetricCard
          label={<L text="Ganhos" hint={{
            title: 'Ganhos',
            definition: 'Quantidade de leads marcados como ganhos com closed_at no período.',
            formula: 'COUNT(leads WHERE status = won AND closed_at BETWEEN período)',
          }} />}
          value={kpis?.won ?? 0}
          icon={<Trophy />}
          delta={pctDelta(kpis?.won, prevKpis?.won)}
        />
        <MetricCard
          label={<L text="Perdas" hint={{
            title: 'Perdas',
            definition: 'Quantidade de leads marcados como perdidos com closed_at no período.',
            formula: 'COUNT(leads WHERE status = lost AND closed_at BETWEEN período)',
          }} />}
          value={kpis?.lost ?? 0}
          icon={<XCircle />}
          delta={pctDelta(kpis?.lost, prevKpis?.lost)}
        />
        {/* Bloco 3 — Volume e tempo */}
        <MetricCard
          label={<L text="Oportunidades no período" hint={{
            title: 'Oportunidades no período',
            definition: 'Leads criados (created_at) dentro do intervalo selecionado.',
            formula: 'COUNT(leads WHERE created_at BETWEEN período)',
          }} />}
          value={kpis?.total_leads ?? 0}
          icon={<Layers />}
          delta={pctDelta(kpis?.total_leads, prevKpis?.total_leads)}
        />
        <MetricCard
          label={<L text="Ciclo médio" hint={{
            title: 'Ciclo médio',
            definition: 'Tempo médio entre criação e fechamento dos leads ganhos no período.',
            formula: 'AVG(closed_at − created_at) dos ganhos',
            note: 'Quanto menor, melhor.',
          }} />}
          value={formatDays(kpis?.avg_cycle_days)}
          icon={<Timer />}
          delta={pctDelta(kpis?.avg_cycle_days, prevKpis?.avg_cycle_days)}
        />
      </div>
    </TooltipProvider>
  );
}
