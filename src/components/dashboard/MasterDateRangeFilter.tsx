import { DateRangePicker, DEFAULT_PRESETS } from '@/components/ui/date-range-picker';
import { getRangeFromPeriod, type MasterPeriod } from '@/hooks/useMasterDashboardData';

interface Props {
  period: MasterPeriod;
  customRange?: { from: Date; to: Date };
  onChange: (period: MasterPeriod, custom?: { from: Date; to: Date }) => void;
}

export function MasterDateRangeFilter({ period, customRange, onChange }: Props) {
  return (
    <DateRangePicker
      value={getRangeFromPeriod(period, customRange)}
      activePresetKey={period}
      presets={DEFAULT_PRESETS}
      align="end"
      className="bg-secondary/50 border-border/50 h-9 text-xs"
      onChange={(range, key) => {
        if (key && key !== 'custom') onChange(key as MasterPeriod);
        else onChange('custom', range);
      }}
    />
  );
}
