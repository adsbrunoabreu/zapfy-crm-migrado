import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { GitBranch, Headphones } from 'lucide-react';

const TABS = [
  { value: 'pipelines', label: 'Pipelines', icon: GitBranch, to: '/reports' },
  { value: 'attendance', label: 'Atendimento', icon: Headphones, to: '/reports/attendance' },
] as const;

interface Props {
  active: 'pipelines' | 'attendance';
}

export function ReportTypeSwitcher({ active }: Props) {
  const { search } = useLocation();
  return (
    <div
      role="tablist"
      aria-label="Tipo de relatório"
      className="inline-flex h-9 items-center rounded-md border border-border/50 bg-secondary/50 p-0.5"
    >
      {TABS.map((t) => {
        const isActive = t.value === active;
        const Icon = t.icon;
        return (
          <Link
            key={t.value}
            to={`${t.to}${search}`}
            role="tab"
            aria-selected={isActive}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-[5px] px-3 text-xs font-medium transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
