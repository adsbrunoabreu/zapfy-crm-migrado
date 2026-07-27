import { DollarSign, MessageSquare, Percent, Timer, TrendingUp, Trophy, Users } from 'lucide-react';
import type { GoalMetric } from '@/hooks/useTeamGoals';

export type MetricUnit = 'currency' | 'integer' | 'percentage' | 'seconds';

export interface MetricConfig {
  key: GoalMetric;
  label: string;
  description: string;
  icon: React.ElementType;
  unit: MetricUnit;
  /** true = quanto maior melhor (default). false = quanto menor melhor (ex: tempo de resposta) */
  higherIsBetter: boolean;
  className: string;
}

export const METRIC_CONFIG: Record<GoalMetric, MetricConfig> = {
  leads: {
    key: 'leads',
    label: 'Leads',
    description: 'Quantidade de leads atribuídos no período',
    icon: Users,
    unit: 'integer',
    higherIsBetter: true,
    className: 'bg-primary/20 text-primary border-primary/30',
  },
  value: {
    key: 'value',
    label: 'Valor (R$)',
    description: 'Soma do valor dos leads ganhos',
    icon: DollarSign,
    unit: 'currency',
    higherIsBetter: true,
    className: 'bg-emerald/20 text-emerald border-emerald/30',
  },
  conversions: {
    key: 'conversions',
    label: 'Conversões',
    description: 'Leads ganhos no período',
    icon: Trophy,
    unit: 'integer',
    higherIsBetter: true,
    className: 'bg-amber/20 text-amber border-amber/30',
  },
  ticket_avg: {
    key: 'ticket_avg',
    label: 'Ticket médio',
    description: 'Valor médio por venda fechada',
    icon: TrendingUp,
    unit: 'currency',
    higherIsBetter: true,
    className: 'bg-cyan/20 text-cyan border-cyan/30',
  },
  conversion_rate: {
    key: 'conversion_rate',
    label: 'Taxa de conversão',
    description: 'Percentual de leads ganhos sobre o total',
    icon: Percent,
    unit: 'percentage',
    higherIsBetter: true,
    className: 'bg-violet/20 text-violet border-violet/30',
  },
  response_time: {
    key: 'response_time',
    label: 'Tempo de resposta',
    description: 'Média em segundos até a primeira resposta (menor é melhor)',
    icon: Timer,
    unit: 'seconds',
    higherIsBetter: false,
    className: 'bg-orange/20 text-orange border-orange/30',
  },
  messages_sent: {
    key: 'messages_sent',
    label: 'Mensagens',
    description: 'Volume de mensagens enviadas no WhatsApp',
    icon: MessageSquare,
    unit: 'integer',
    higherIsBetter: true,
    className: 'bg-blue/20 text-blue border-blue/30',
  },
};

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const INT = new Intl.NumberFormat('pt-BR');
const DEC = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatMetricValue(value: number, metric: GoalMetric): string {
  const cfg = METRIC_CONFIG[metric];
  if (!cfg) return INT.format(value);
  switch (cfg.unit) {
    case 'currency':
      return BRL.format(value);
    case 'percentage':
      return `${DEC.format(value)}%`;
    case 'seconds': {
      if (value < 60) return `${Math.round(value)}s`;
      const mins = value / 60;
      if (mins < 60) return `${DEC.format(mins)} min`;
      return `${DEC.format(mins / 60)} h`;
    }
    default:
      return INT.format(Math.round(value));
  }
}

/**
 * Calcula percentual de progresso considerando se a métrica é "menor é melhor".
 * Para tempo de resposta: se atinge ≤ alvo, 100%; senão proporcional inverso.
 */
export function computeProgressPct(current: number, target: number, metric: GoalMetric): number {
  if (target <= 0) return 0;
  const cfg = METRIC_CONFIG[metric];
  if (cfg.higherIsBetter) {
    return Math.min(Math.round((current / target) * 100), 150);
  }
  // Lower is better
  if (current <= 0) return 0;
  if (current <= target) return 100;
  return Math.max(0, Math.round((target / current) * 100));
}
