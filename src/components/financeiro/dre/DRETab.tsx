import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { DateRangePicker, DEFAULT_PRESETS } from '@/components/ui/date-range-picker';
import { Skeleton } from '@/components/ui/skeleton';
import { KpiDeltaCard } from '@/components/financeiro/KpiDeltaCard';
import { DREHierarchyTable } from './DREHierarchyTable';
import { DRECharts } from './DRECharts';
import { DREInsights } from './DREInsights';
import { DREDrillDownDialog } from './DREDrillDownDialog';
import { useDREComparison, useDREInsights, type DreBasis, type DreFilters } from '@/hooks/finance/useDRE';
import { computeTotals, type DreSection } from '@/lib/dre';
import { exportDREtoCSV, exportDREtoPDF, exportDREtoXLSX } from '@/lib/dre-export';
import { formatBRL } from '@/lib/finance';
import { getAppRangeForPreset } from '@/lib/appDate';
import {
  Wallet, ArrowDownCircle, ArrowUpCircle, TrendingUp, Scale,
  Target, Percent, Download, FileSpreadsheet, FileText, File,
} from 'lucide-react';

const SkeletonGrid = () => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[110px]" />)}
  </div>
);

export function DRETab() {
  const [range, setRange] = useState(() => {
    const r = getAppRangeForPreset('30d');
    return { from: r.from, to: r.to, presetKey: '30d' as string | undefined };
  });
  const [basis, setBasis] = useState<DreBasis>('competencia');
  const [filters] = useState<DreFilters>({});
  const [drill, setDrill] = useState<{ section: DreSection; label: string } | null>(null);

  const cmp = useDREComparison(range.from, range.to, basis, filters);
  const ins = useDREInsights(range.from, range.to, basis, filters);

  const current = cmp.data?.current;
  const previous = cmp.data?.previous;
  const totals = current ? computeTotals(current.sections) : null;
  const prevTotals = previous ? computeTotals(previous.sections) : null;

  return (
    <div className="space-y-4">
      {/* Header / filtros */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker
            value={{ from: range.from, to: range.to }}
            activePresetKey={range.presetKey}
            presets={DEFAULT_PRESETS}
            onChange={(v, presetKey) => setRange({ from: v.from, to: v.to, presetKey })}
          />
          <Select value={basis} onValueChange={(v) => setBasis(v as DreBasis)}>
            <SelectTrigger className="h-9 w-[170px] bg-secondary/50 border-border/50 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="competencia">Regime: Competência</SelectItem>
              <SelectItem value="caixa">Regime: Caixa</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!current}>
                  <Download className="w-4 h-4 mr-2" />Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => current && exportDREtoPDF(current)}>
                  <FileText className="w-4 h-4 mr-2" />PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => current && exportDREtoXLSX(current)}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => current && exportDREtoCSV(current)}>
                  <File className="w-4 h-4 mr-2" />CSV
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </Card>

      {/* KPI cards */}
      {cmp.isLoading || !totals ? (
        <SkeletonGrid />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiDeltaCard label="Receita Bruta" value={formatBRL(totals.receitaBruta)}
            previous={prevTotals?.receitaBruta} current={totals.receitaBruta}
            icon={<Wallet className="w-4 h-4" />} tone="info" />
          <KpiDeltaCard label="Receita Líquida" value={formatBRL(totals.receitaLiquida)}
            previous={prevTotals?.receitaLiquida} current={totals.receitaLiquida}
            icon={<ArrowDownCircle className="w-4 h-4" />} />
          <KpiDeltaCard label="Custos" value={formatBRL(totals.custos)}
            previous={prevTotals?.custos} current={totals.custos}
            icon={<ArrowUpCircle className="w-4 h-4" />} tone="warning" />
          <KpiDeltaCard label="Despesas" value={formatBRL(totals.despesas)}
            previous={prevTotals?.despesas} current={totals.despesas}
            icon={<ArrowUpCircle className="w-4 h-4" />} tone="warning" />
          <KpiDeltaCard label="EBITDA" value={formatBRL(totals.ebitda)}
            previous={prevTotals?.ebitda} current={totals.ebitda}
            icon={<TrendingUp className="w-4 h-4" />}
            tone={totals.ebitda >= 0 ? 'success' : 'danger'} />
          <KpiDeltaCard label="Lucro Líquido" value={formatBRL(totals.lucroLiquido)}
            previous={prevTotals?.lucroLiquido} current={totals.lucroLiquido}
            icon={<Scale className="w-4 h-4" />}
            tone={totals.lucroLiquido >= 0 ? 'success' : 'danger'} />
          <KpiDeltaCard label="Margem EBITDA" value={`${totals.margemEbitda.toFixed(1)}%`}
            previous={prevTotals?.margemEbitda} current={totals.margemEbitda}
            icon={<Percent className="w-4 h-4" />} />
          <KpiDeltaCard label="Margem Líquida" value={`${totals.margemLiquida.toFixed(1)}%`}
            previous={prevTotals?.margemLiquida} current={totals.margemLiquida}
            icon={<Target className="w-4 h-4" />} />
        </div>
      )}

      {/* Insights */}
      <DREInsights data={ins.data ?? []} loading={ins.isLoading} />

      {/* DRE Hierárquico */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DREHierarchyTable
            current={current}
            previous={previous}
            loading={cmp.isLoading}
            onDrill={(section, label) => setDrill({ section, label })}
          />
        </div>
        <div>
          <DRECharts current={current} previous={previous} loading={cmp.isLoading} />
        </div>
      </div>

      <DREDrillDownDialog
        open={!!drill}
        onOpenChange={(o) => !o && setDrill(null)}
        section={drill?.section ?? null}
        label={drill?.label ?? ''}
        from={range.from}
        to={range.to}
        basis={basis}
      />
    </div>
  );
}
