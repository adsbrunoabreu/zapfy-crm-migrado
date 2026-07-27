import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InfoHint } from './InfoHint';

export type DeltaUnit = 'percent' | 'pp' | 'minutes';

export interface StatCardHint {
  title?: string;
  definition: string;
  formula?: string;
  note?: string;
}

interface Props {
  label: string;
  value: string;
  rawValue?: number;
  countUp?: boolean;
  current: number;
  previous: number;
  deltaUnit?: DeltaUnit;
  /** quando true, queda é positiva (ex: tempo de resposta) */
  invertDelta?: boolean;
  icon: LucideIcon;
  /** mantidos por compatibilidade — não usados no novo padrão visual */
  iconColor?: string;
  iconBg?: string;
  hint?: StatCardHint;
  className?: string;
}

function useCountUp(target: number, enabled: boolean, duration = 800) {
  const [val, setVal] = useState(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) { setVal(target); return; }
    let raf: number;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, duration]);
  return val;
}

/**
 * Padrão visual unificado dos cartões de métrica (Dashboards e Relatórios):
 * - label: text-xs muted (sem uppercase)
 * - valor: text-2xl font-semibold tabular-nums
 * - ícone: 16px em chip 28x28 bg-primary/10 no canto superior direito
 * - delta: text-xs com seta, verde/vermelho conforme sinal
 */
export function StatCard({
  label, value, rawValue, countUp, current, previous,
  deltaUnit = 'percent', invertDelta, icon: Icon,
  hint, className,
}: Props) {
  const animated = useCountUp(rawValue ?? 0, !!countUp && rawValue !== undefined);
  const display = countUp && rawValue !== undefined
    ? value.replace(/[\d.,]+/, Math.round(animated).toLocaleString('pt-BR'))
    : value;

  // Delta
  let deltaText: string | null = null;
  let deltaValue = 0;
  let isNew = false;
  if (previous === 0 && current === 0) {
    deltaText = null;
  } else if (previous === 0) {
    deltaText = 'Novo';
    isNew = true;
  } else if (deltaUnit === 'percent') {
    const pct = ((current - previous) / Math.abs(previous)) * 100;
    deltaValue = pct;
    deltaText = `${Math.abs(pct).toFixed(1)}%`;
  } else if (deltaUnit === 'pp') {
    const diff = current - previous;
    deltaValue = diff;
    deltaText = `${Math.abs(diff).toFixed(1)} p.p.`;
  } else if (deltaUnit === 'minutes') {
    const diffMin = (current - previous) * 60;
    deltaValue = diffMin;
    deltaText = `${Math.abs(diffMin).toFixed(0)}min`;
  }

  // Aplica inversão de semântica (queda boa)
  const effective = invertDelta ? -deltaValue : deltaValue;
  const isUp = !isNew && effective > 0.05;
  const isDown = !isNew && effective < -0.05;

  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          {label}
          {hint && <InfoHint title={hint.title ?? label} definition={hint.definition} formula={hint.formula} note={hint.note} />}
        </p>
        <span className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="text-2xl font-semibold text-foreground mt-1 tabular-nums">{display}</p>
      {deltaText && (
        <p
          className={cn(
            'text-xs mt-1 flex items-center gap-1 tabular-nums',
            isUp && 'text-[hsl(var(--emerald))]',
            isDown && 'text-destructive',
            !isUp && !isDown && 'text-muted-foreground',
          )}
        >
          {isUp && <ArrowUp className="h-3 w-3" />}
          {isDown && <ArrowDown className="h-3 w-3" />}
          {deltaText}
          {!isNew && <span className="text-muted-foreground ml-1">vs anterior</span>}
        </p>
      )}
    </div>
  );
}
