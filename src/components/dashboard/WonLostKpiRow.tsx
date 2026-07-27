import { Trophy, XCircle, Target, Clock, DollarSign, Banknote } from 'lucide-react';
import { StatCard } from './StatCard';
import { formatBRL } from '@/lib/format';
import type { ClosingsKpi } from '@/lib/dashboardMetrics';

interface Props {
  closings: ClosingsKpi & { previous: ClosingsKpi };
}

function fmtDays(d: number) {
  if (!d || d <= 0) return '—';
  if (d < 1) return `${Math.round(d * 24)}h`;
  return `${d.toFixed(1)} dias`;
}

export function WonLostKpiRow({ closings }: Props) {
  const c = closings;
  const p = closings.previous;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <StatCard
        label="Leads Ganhos"
        value={c.wonCount.toLocaleString('pt-BR')}
        rawValue={c.wonCount}
        countUp
        current={c.wonCount}
        previous={p.wonCount}
        icon={Trophy}
        iconColor="text-[hsl(var(--emerald))]"
        iconBg="bg-[hsl(var(--emerald))]/15"
        hint={{
          title: 'Leads Ganhos',
          definition: 'Leads marcados como ganho (closed_at no período + estágio do tipo won).',
          formula: 'COUNT(leads WHERE closed_at BETWEEN período AND stage_type = won)',
        }}
      />
      <StatCard
        label="Leads Perdidos"
        value={c.lostCount.toLocaleString('pt-BR')}
        rawValue={c.lostCount}
        countUp
        current={c.lostCount}
        previous={p.lostCount}
        invertDelta
        icon={XCircle}
        iconColor="text-destructive"
        iconBg="bg-destructive/15"
        hint={{
          title: 'Leads Perdidos',
          definition: 'Leads marcados como perdido (closed_at no período + estágio do tipo lost).',
          formula: 'COUNT(leads WHERE closed_at BETWEEN período AND stage_type = lost)',
          note: 'Variação invertida: subir é ruim.',
        }}
      />
      <StatCard
        label="Win Rate (fechados)"
        value={`${c.winRateClosed.toFixed(1)}%`}
        current={c.winRateClosed}
        previous={p.winRateClosed}
        deltaUnit="pp"
        icon={Target}
        iconColor="text-[hsl(var(--cyan))]"
        iconBg="bg-[hsl(var(--cyan))]/15"
        hint={{
          title: 'Win Rate sobre fechados',
          definition: '% de leads ganhos entre todos os leads fechados (won + lost) no período.',
          formula: 'Win rate = ganhos / (ganhos + perdidos) × 100',
          note: 'Usa closed_at, não created_at — reflete a performance de fechamento.',
        }}
      />
      <StatCard
        label="Receita Ganha"
        value={formatBRL(c.wonRevenue)}
        current={c.wonRevenue}
        previous={p.wonRevenue}
        icon={DollarSign}
        iconColor="text-[hsl(var(--emerald))]"
        iconBg="bg-[hsl(var(--emerald))]/15"
        hint={{
          title: 'Receita Ganha',
          definition: 'Soma do campo valor dos leads marcados como ganho no período.',
          formula: 'Σ value WHERE closed_at BETWEEN período AND stage_type = won',
        }}
      />
      <StatCard
        label="Ticket Médio Ganho"
        value={formatBRL(c.avgWonTicket)}
        current={c.avgWonTicket}
        previous={p.avgWonTicket}
        icon={Banknote}
        iconColor="text-[hsl(var(--violet))]"
        iconBg="bg-[hsl(var(--violet))]/15"
        hint={{
          title: 'Ticket Médio Ganho',
          definition: 'Valor médio dos leads ganhos com valor > 0 no período.',
          formula: 'Ticket médio ganho = receita_ganha / leads_ganhos_com_valor',
        }}
      />
      <StatCard
        label="Ciclo Médio"
        value={fmtDays(c.avgCycleDays)}
        current={c.avgCycleDays}
        previous={p.avgCycleDays}
        deltaUnit="percent"
        invertDelta
        icon={Clock}
        iconColor="text-[hsl(var(--amber))]"
        iconBg="bg-[hsl(var(--amber))]/15"
        hint={{
          title: 'Ciclo Médio de Venda',
          definition: 'Tempo médio entre criação do lead e marcação como ganho.',
          formula: 'AVG(closed_at − created_at) dos leads ganhos',
          note: 'Quanto menor, melhor — variação invertida.',
        }}
      />
    </div>
  );
}
