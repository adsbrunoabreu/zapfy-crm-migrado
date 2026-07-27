import { useMemo, useState } from 'react';

export type PeriodKey = 'this_month' | 'last_month' | 'last_3_months' | 'year' | 'custom';
export type GoalsMetric = 'value' | 'conversions' | 'leads' | 'responses';
export type GoalsStatusFilter = 'all' | 'active' | 'inactive' | 'completed';

export interface CustomRange {
  start?: Date;
  end?: Date;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function periodRange(key: PeriodKey, custom?: CustomRange): { start: string; end: string } {
  const now = new Date();
  if (key === 'this_month') {
    return {
      start: fmt(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (key === 'last_month') {
    return {
      start: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      end: fmt(new Date(now.getFullYear(), now.getMonth(), 0)),
    };
  }
  if (key === 'last_3_months') {
    return {
      start: fmt(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
      end: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  }
  if (key === 'year') {
    return {
      start: fmt(new Date(now.getFullYear(), 0, 1)),
      end: fmt(new Date(now.getFullYear(), 11, 31)),
    };
  }
  return {
    start: fmt(custom?.start ?? new Date(now.getFullYear(), now.getMonth(), 1)),
    end: fmt(custom?.end ?? new Date()),
  };
}

export const PERIOD_OPTIONS: { value: PeriodKey; label: string }[] = [
  { value: 'this_month', label: 'Mês atual' },
  { value: 'last_month', label: 'Mês anterior' },
  { value: 'last_3_months', label: 'Últimos 3 meses' },
  { value: 'year', label: 'Ano' },
  { value: 'custom', label: 'Personalizado' },
];

export const METRIC_OPTIONS: { value: GoalsMetric; label: string }[] = [
  { value: 'value', label: 'Valor faturado' },
  { value: 'conversions', label: 'Conversões' },
  { value: 'leads', label: 'Leads' },
  { value: 'responses', label: 'Mensagens' },
];

export const STATUS_OPTIONS: { value: GoalsStatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'active', label: 'Ativa' },
  { value: 'inactive', label: 'Inativa' },
  { value: 'completed', label: 'Concluída' },
];

export function useGoalsPageFilters() {
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<PeriodKey>('this_month');
  const [metric, setMetric] = useState<GoalsMetric>('value');
  const [status, setStatus] = useState<GoalsStatusFilter>('all');
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();

  const range = useMemo(
    () => periodRange(period, { start: customStart, end: customEnd }),
    [period, customStart, customEnd],
  );

  return {
    search, setSearch,
    period, setPeriod,
    metric, setMetric,
    status, setStatus,
    customStart, setCustomStart,
    customEnd, setCustomEnd,
    range,
  };
}
