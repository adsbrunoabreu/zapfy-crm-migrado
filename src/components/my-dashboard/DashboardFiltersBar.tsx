import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { FilterSelect } from '@/components/filters/FilterSelect';
import { FilterPopoverButton } from '@/components/filters/FilterPopoverButton';
import { DateRangePicker, DEFAULT_PRESETS } from '@/components/ui/date-range-picker';
import { useTags } from '@/hooks/useTags';
import type { DashboardFilters, PeriodPreset } from '@/hooks/useMyDashboardData';
import type { Pipeline } from '@/hooks/usePipelines';

interface DashboardFiltersBarProps {
  filters: DashboardFilters;
  onFiltersChange: (filters: DashboardFilters) => void;
  pipelines: Pipeline[];
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'new', label: 'Novos' },
  { value: 'contacted', label: 'Em Contato' },
  { value: 'negotiation', label: 'Negociando' },
  { value: 'won', label: 'Fechados' },
  { value: 'lost', label: 'Perdidos' },
];

// Compatibilidade com chaves antigas que podem estar persistidas em localStorage.
function migrateLegacyKey(p: string): PeriodPreset {
  switch (p) {
    case '7days': return '7d';
    case '30days': return '30d';
    case '6months': return '90d';
    case 'year': return 'ytd';
    default: return p as PeriodPreset;
  }
}

function periodToRange(filters: DashboardFilters) {
  const key = migrateLegacyKey(filters.period);
  const p = DEFAULT_PRESETS.find(x => x.key === key);
  if (p) return p.getRange();
  if (filters.period === 'custom' && filters.customStart && filters.customEnd) {
    return { from: filters.customStart, to: filters.customEnd };
  }
  return undefined;
}

export function DashboardFiltersBar({ filters, onFiltersChange, pipelines }: DashboardFiltersBarProps) {
  const { data: tags = [] } = useTags();
  const selectedTagIds = filters.tagIds || [];
  const activeKey = migrateLegacyKey(filters.period);

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.pipelineId) n++;
    if (filters.status && filters.status !== 'all') n++;
    if (selectedTagIds.length > 0) n++;
    return n;
  }, [filters, selectedTagIds.length]);

  function toggleTag(tagId: string) {
    const current = filters.tagIds || [];
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onFiltersChange({ ...filters, tagIds: next.length > 0 ? next : undefined });
  }

  function clearAll() {
    onFiltersChange({ ...filters, pipelineId: undefined, status: undefined, tagIds: undefined });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterPopoverButton activeCount={activeCount} onClear={clearAll}>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Pipeline</Label>
            <FilterSelect
              value={filters.pipelineId || 'all'}
              onValueChange={(v) => onFiltersChange({ ...filters, pipelineId: v === 'all' ? undefined : v })}
              options={[
                { value: 'all', label: 'Todos os pipelines' },
                ...pipelines.map((p) => ({ value: p.id, label: p.name })),
              ]}
              placeholder="Pipeline"
              width="w-full"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Status</Label>
            <FilterSelect
              value={filters.status || 'all'}
              onValueChange={(v) => onFiltersChange({ ...filters, status: v === 'all' ? undefined : v })}
              options={STATUS_OPTIONS}
              placeholder="Status"
              width="w-full"
            />
          </div>

          {tags.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Tags</Label>
              <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
                {tags.map((tag) => (
                  <label
                    key={tag.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-secondary/50 rounded-md p-1.5 transition-colors"
                  >
                    <Checkbox
                      checked={selectedTagIds.includes(tag.id)}
                      onCheckedChange={() => toggleTag(tag.id)}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: tag.color || 'hsl(var(--primary))' }}
                    />
                    <span className="text-xs truncate">{tag.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </FilterPopoverButton>

      <DateRangePicker
        value={periodToRange(filters)}
        activePresetKey={activeKey}
        presets={DEFAULT_PRESETS}
        align="end"
        className="bg-secondary/50 border-border/50 h-9 text-xs"
        onChange={(range, key) => {
          if (key && key !== 'custom') {
            onFiltersChange({ ...filters, period: key as PeriodPreset, customStart: undefined, customEnd: undefined });
          } else {
            onFiltersChange({ ...filters, period: 'custom', customStart: range.from, customEnd: range.to });
          }
        }}
      />
    </div>
  );
}
