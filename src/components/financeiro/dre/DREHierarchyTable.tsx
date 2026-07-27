import { Fragment, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBRL } from '@/lib/finance';
import {
  DRE_LABEL, GROUP_LABEL, GROUP_ORDER, GROUP_SECTIONS,
  computeTotals, sumGroup, type DreReport, type DreSection, type DreGroup,
} from '@/lib/dre';

interface Props {
  current?: DreReport;
  previous?: DreReport;
  loading?: boolean;
  onDrill: (section: DreSection, label: string) => void;
}

const SIGN: Record<DreGroup, 1 | -1> = {
  receita_bruta: 1, deducoes: -1, custos_diretos: -1,
  despesas_operacionais: -1, resultado_financeiro: -1, impostos_grp: -1,
};

export function DREHierarchyTable({ current, previous, loading, onDrill }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({ receita_bruta: true });

  const totals = useMemo(() => current ? computeTotals(current.sections) : null, [current]);
  const prevTotals = useMemo(() => previous ? computeTotals(previous.sections) : null, [previous]);

  if (loading || !current || !totals) {
    return <Card className="p-4 space-y-2">{Array.from({length:14}).map((_,i)=><Skeleton key={i} className="h-7"/>)}</Card>;
  }

  const delta = (cur: number, prev?: number) => {
    if (prev === undefined || prev === 0) return null;
    return ((cur - prev) / Math.abs(prev)) * 100;
  };

  const toggle = (k: string) => setOpen((s) => ({ ...s, [k]: !s[k] }));

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Demonstrativo de Resultado</h3>
        <span className="text-xs text-muted-foreground">
          {current.period.basis === 'caixa' ? 'Regime de Caixa' : 'Regime de Competência'}
        </span>
      </div>
      <div className="divide-y divide-border/40">
        {GROUP_ORDER.map((group) => {
          const sign = SIGN[group];
          const groupTotalRaw = sumGroup(current.sections, group);
          const prevGroupTotal = previous ? sumGroup(previous.sections, group) : undefined;
          const groupTotal = sign * groupTotalRaw;
          const prevGroupSigned = prevGroupTotal !== undefined ? sign * prevGroupTotal : undefined;
          const d = delta(groupTotal, prevGroupSigned);
          const isOpen = !!open[group];

          return (
            <Fragment key={group}>
              <button
                onClick={() => toggle(group)}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-secondary/40 transition-colors text-left"
              >
                {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <span className="flex-1">{GROUP_LABEL[group]}</span>
                {d !== null && (
                  <span className={cn('text-xs tabular-nums', d >= 0 ? 'text-emerald' : 'text-rose')}>
                    {d >= 0 ? '+' : ''}{d.toFixed(1)}%
                  </span>
                )}
                <span className={cn('w-32 text-right tabular-nums', sign === -1 && 'text-rose')}>
                  {formatBRL(groupTotal)}
                </span>
              </button>
              {isOpen && GROUP_SECTIONS[group].map((sec) => {
                const v = Number(current.sections[sec] ?? 0);
                if (!v) return null;
                const pv = previous ? Number(previous.sections[sec] ?? 0) : undefined;
                const dd = delta(v, pv);
                return (
                  <button
                    key={sec}
                    onClick={() => onDrill(sec, DRE_LABEL[sec])}
                    className="w-full flex items-center gap-2 pl-12 pr-4 py-2 text-xs hover:bg-secondary/30 transition-colors text-left"
                  >
                    <span className="flex-1 text-muted-foreground">{DRE_LABEL[sec]}</span>
                    {dd !== null && (
                      <span className={cn('tabular-nums', (sign === 1 ? dd >= 0 : dd <= 0) ? 'text-emerald' : 'text-rose')}>
                        {dd >= 0 ? '+' : ''}{dd.toFixed(1)}%
                      </span>
                    )}
                    <span className={cn('w-32 text-right tabular-nums', sign === -1 && 'text-rose')}>
                      {formatBRL(sign * v)}
                    </span>
                  </button>
                );
              })}
            </Fragment>
          );
        })}

        {/* Linhas de resultado */}
        <SubtotalRow label="= RECEITA LÍQUIDA" value={totals.receitaLiquida} prev={prevTotals?.receitaLiquida} />
        <SubtotalRow label="= LUCRO BRUTO" value={totals.lucroBruto} prev={prevTotals?.lucroBruto} />
        <SubtotalRow label="= EBITDA" value={totals.ebitda} prev={prevTotals?.ebitda} highlight />
        <SubtotalRow label="= LUCRO ANTES DOS IMPOSTOS" value={totals.lucroAntesImpostos} prev={prevTotals?.lucroAntesImpostos} />
        <SubtotalRow label="= LUCRO LÍQUIDO" value={totals.lucroLiquido} prev={prevTotals?.lucroLiquido} highlight />
      </div>

      <div className="px-4 py-3 border-t border-border/60 grid grid-cols-3 gap-2 text-xs">
        <Metric label="Margem Bruta" value={`${totals.margemBruta.toFixed(1)}%`} />
        <Metric label="Margem EBITDA" value={`${totals.margemEbitda.toFixed(1)}%`} />
        <Metric label="Margem Líquida" value={`${totals.margemLiquida.toFixed(1)}%`} />
      </div>
    </Card>
  );
}

function SubtotalRow({ label, value, prev, highlight }: { label: string; value: number; prev?: number; highlight?: boolean }) {
  const d = prev !== undefined && prev !== 0 ? ((value - prev) / Math.abs(prev)) * 100 : null;
  return (
    <div className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-l-2',
      highlight ? 'border-l-primary bg-primary/5' : 'border-l-transparent')}>
      <span className="flex-1">{label}</span>
      {d !== null && (
        <span className={cn('text-xs tabular-nums', d >= 0 ? 'text-emerald' : 'text-rose')}>
          {d >= 0 ? '+' : ''}{d.toFixed(1)}%
        </span>
      )}
      <span className={cn('w-32 text-right tabular-nums', value < 0 && 'text-rose')}>{formatBRL(value)}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}
