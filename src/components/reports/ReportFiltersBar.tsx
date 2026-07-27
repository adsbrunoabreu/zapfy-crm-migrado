import { ReactNode, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { DateRangePicker, type RangePreset, type DateRange } from '@/components/ui/date-range-picker';
import { FilterPopoverButton } from '@/components/filters/FilterPopoverButton';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useLossReasons } from '@/hooks/useLossReasons';
import { usePipelines } from '@/hooks/usePipelines';
import { useCompanies } from '@/hooks/useCompanies';
import { useAuth } from '@/contexts/AuthContext';
import type { ReportStatusFilter } from '@/hooks/usePipelinePerformance';

export interface ReportFilters {
  period: string;
  range: DateRange;
  customRange?: DateRange;
  companyId?: string;
  pipelineId?: string;
  userId?: string;
  status: ReportStatusFilter;
  lossReasonId?: string;
}

interface Props {
  filters: ReportFilters;
  presets: RangePreset[];
  onChange: (next: Partial<ReportFilters>) => void;
  onRangeChange: (r: DateRange, key?: string) => void;
  onClear: () => void;
  /** Slot opcional renderizado entre Filtros e Data (ex.: Exportar CSV) */
  extraAction?: ReactNode;
}

const STATUS_OPTIONS: { value: ReportStatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos os status' },
  { value: 'open', label: 'Em aberto' },
  { value: 'won', label: 'Ganhos' },
  { value: 'lost', label: 'Perdidos' },
];

const TRIGGER_CLS = 'bg-secondary/50 border-border/50 h-9';

export function ReportFiltersBar({ filters, presets, onChange, onRangeChange, onClear, extraAction }: Props) {
  const { isMaster } = useAuth();
  const { data: companies } = useCompanies();
  const { data: pipelines } = usePipelines();
  const { data: members } = useTeamMembers();
  const { data: lossReasons } = useLossReasons({ onlyActive: true });

  const showLossReason = filters.status === 'lost' || filters.status === 'all';

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.companyId) n++;
    if (filters.pipelineId) n++;
    if (filters.userId) n++;
    if (filters.status && filters.status !== 'all') n++;
    if (filters.lossReasonId) n++;
    return n;
  }, [filters]);

  return (
    <div className="flex items-center gap-2">
      {extraAction}

      <FilterPopoverButton activeCount={activeCount} onClear={onClear}>
        <div className="space-y-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Seleção</span>

          {isMaster && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Empresa</Label>
              <Select
                value={filters.companyId ?? 'mine'}
                onValueChange={(v) => onChange({ companyId: v === 'mine' ? undefined : v })}
              >
                <SelectTrigger className={TRIGGER_CLS}>
                  <SelectValue placeholder="Empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mine">Minha empresa</SelectItem>
                  {(companies ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Pipeline</Label>
            <Select
              value={filters.pipelineId ?? 'all'}
              onValueChange={(v) => onChange({ pipelineId: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className={TRIGGER_CLS}>
                <SelectValue placeholder="Todos os pipelines" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pipelines</SelectItem>
                {(pipelines ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Responsável</Label>
            <Select
              value={filters.userId ?? 'all'}
              onValueChange={(v) => onChange({ userId: v === 'all' ? undefined : v })}
            >
              <SelectTrigger className={TRIGGER_CLS}>
                <SelectValue placeholder="Todos os responsáveis" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os responsáveis</SelectItem>
                <SelectItem value="00000000-0000-0000-0000-000000000000">Sem responsável</SelectItem>
                {(members ?? []).filter((m) => m.isActive).map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3 pt-3 border-t border-border/40">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Status</span>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Status</Label>
            <Select
              value={filters.status}
              onValueChange={(v) => onChange({ status: v as ReportStatusFilter })}
            >
              <SelectTrigger className={TRIGGER_CLS}>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {showLossReason && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Motivo de perda</Label>
              <Select
                value={filters.lossReasonId ?? 'all'}
                onValueChange={(v) => onChange({ lossReasonId: v === 'all' ? undefined : v })}
              >
                <SelectTrigger className={TRIGGER_CLS}>
                  <SelectValue placeholder="Todos os motivos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os motivos</SelectItem>
                  {(lossReasons ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </FilterPopoverButton>

      {activeCount > 0 && (
        <Button
          type="button"
          variant="outline"
          className="h-9 bg-secondary/50 border-border/50 text-xs gap-1.5"
          onClick={onClear}
        >
          <X className="w-3.5 h-3.5" />
          Limpar
        </Button>
      )}

      <DateRangePicker
        value={filters.range}
        activePresetKey={filters.period}
        presets={presets}
        align="end"
        onChange={onRangeChange}
        className="bg-secondary/50 border-border/50 h-9 text-xs"
      />
    </div>
  );
}
