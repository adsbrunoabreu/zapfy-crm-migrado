import { DateRangePicker, DEFAULT_PRESETS } from '@/components/ui/date-range-picker';
import type { DashboardPeriod } from '@/hooks/useDashboardData';
import { getRangeForPeriod } from '@/hooks/useDashboardData';

interface Props {
  period: DashboardPeriod;
  customRange?: { from: Date; to: Date };
  onChange: (period: DashboardPeriod, custom?: { from: Date; to: Date }) => void;
}

function periodToRange(period: DashboardPeriod, custom?: { from: Date; to: Date }): { from: Date; to: Date } | undefined {
  const r = getRangeForPeriod(period, custom);
  return { from: r.startDate, to: r.endDate };
}

export function DateRangeFilter({ period, customRange, onChange }: Props) {
  return (
    <DateRangePicker
      value={periodToRange(period, customRange)}
      activePresetKey={period}
      presets={DEFAULT_PRESETS}
      align="end"
      className="bg-secondary/50 border-border/50 h-9 text-xs"
      onChange={(range, key) => {
        if (key && key !== 'custom') {
          onChange(key as DashboardPeriod);
        } else {
          onChange('custom', range);
        }
      }}
    />
  );
}
