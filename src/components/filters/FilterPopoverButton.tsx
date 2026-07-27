import { ReactNode, useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface FilterPopoverButtonProps {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  title?: string;
}

export function FilterPopoverButton({
  activeCount,
  onClear,
  children,
  title = 'Filtros',
}: FilterPopoverButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="relative h-9 bg-secondary/50 border-border/50 text-xs gap-2"
        >
          <Filter className="w-3.5 h-3.5" />
          Filtros
          {activeCount > 0 && (
            <Badge className="ml-1 h-4 min-w-[16px] px-1 flex items-center justify-center text-[10px]">
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{title}</h4>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onClear} className="h-8 text-xs">
                <X className="w-3 h-3 mr-1" />
                Limpar
              </Button>
            )}
          </div>
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
