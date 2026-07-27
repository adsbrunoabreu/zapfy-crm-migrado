import { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface FilterBarProps {
  children?: ReactNode;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Extra info text shown after filters, e.g. "42 resultados" */
  infoText?: string;
}

export function FilterBar({
  children,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Buscar...',
  infoText,
}: FilterBarProps) {
  return (
    <Card className="glass-card p-4">
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        {onSearchChange !== undefined && (
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-10 bg-secondary/50 border-border/50"
            />
          </div>
        )}
        <div className="flex flex-wrap gap-3 items-center">
          {children}
        </div>
        {infoText && (
          <span className="text-sm text-muted-foreground ml-auto whitespace-nowrap">
            {infoText}
          </span>
        )}
      </div>
    </Card>
  );
}
