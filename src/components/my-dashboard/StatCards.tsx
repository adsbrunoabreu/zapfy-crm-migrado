import { Users, DollarSign, TrendingUp, Clock } from 'lucide-react';
import { MetricCard } from '@/components/ui/metric-card';

interface StatCardsProps {
  total: number;
  totalValue: number;
  conversionRate: string;
  pendingActivities: number;
  prevTotal: number;
  prevTotalValue: number;
  prevWonCount: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
  }).format(value);
}

function pctDelta(current: number, previous: number): { value: number; label?: string } | undefined {
  if (previous === 0 && current === 0) return undefined;
  if (previous === 0) return { value: 100, label: 'vs anterior' };
  return { value: ((current - previous) / Math.abs(previous)) * 100, label: 'vs anterior' };
}

export function StatCards(props: StatCardsProps) {
  const conversionPct = parseFloat(props.conversionRate) || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
      <MetricCard
        label="Meus Leads"
        value={props.total}
        icon={<Users />}
        delta={pctDelta(props.total, props.prevTotal)}
      />
      <MetricCard
        label="Valor Total"
        value={formatCurrency(props.totalValue)}
        icon={<DollarSign />}
        delta={pctDelta(props.totalValue, props.prevTotalValue)}
      />
      <MetricCard
        label="Taxa de Conversão"
        value={`${props.conversionRate}%`}
        icon={<TrendingUp />}
        delta={pctDelta(conversionPct, props.prevWonCount)}
      />
      <MetricCard
        label="Atividades Pendentes"
        value={props.pendingActivities}
        icon={<Clock />}
      />
    </div>
  );
}
