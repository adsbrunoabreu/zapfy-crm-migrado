/**
 * Toggle compartilhado Kanban|Lista usado nos headers das páginas
 * Pipelines e Leads (renderizadas dentro de /oportunidades).
 *
 * Persiste a escolha em localStorage por empresa e sincroniza com
 * o query param `?view=` para que a página Opportunities reaja.
 */
import { Kanban as KanbanIcon, List as ListIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const STORAGE_PREFIX = 'opps-view-mode';

export function OpportunityViewToggle({ value }: { value: 'kanban' | 'list' }) {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();

  const handleChange = (v: string) => {
    if (v !== 'kanban' && v !== 'list') return;
    try {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}:${profile?.company_id ?? 'anon'}`,
        v,
      );
    } catch {}
    const next = new URLSearchParams(params);
    next.set('view', v);
    setParams(next, { replace: true });
  };

  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(v) => v && handleChange(v)}
      className="border border-border rounded-md p-0.5 bg-card/40"
    >
      <ToggleGroupItem
        value="kanban"
        aria-label="Visualização Kanban"
        className={cn(
          'h-7 px-2 text-xs gap-1.5 rounded',
          'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
        )}
      >
        <KanbanIcon className="w-3.5 h-3.5" />
        Kanban
      </ToggleGroupItem>
      <ToggleGroupItem
        value="list"
        aria-label="Visualização em lista"
        className={cn(
          'h-7 px-2 text-xs gap-1.5 rounded',
          'data-[state=on]:bg-primary data-[state=on]:text-primary-foreground',
        )}
      >
        <ListIcon className="w-3.5 h-3.5" />
        Lista
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
