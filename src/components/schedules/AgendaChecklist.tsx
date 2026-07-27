import { useState, KeyboardEvent } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgendaChecklistItem } from '@/hooks/useAppointments';

interface Props {
  items: AgendaChecklistItem[];
  onChange: (items: AgendaChecklistItem[]) => void;
  /** Modo somente-leitura para visualização no Drawer */
  readOnly?: boolean;
  className?: string;
}

function newId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function AgendaChecklist({ items, onChange, readOnly = false, className }: Props) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: newId(), text, done: false }]);
    setDraft('');
  };

  const toggle = (id: string) => {
    onChange(items.map(i => (i.id === id ? { ...i, done: !i.done } : i)));
  };

  const remove = (id: string) => {
    onChange(items.filter(i => i.id !== id));
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  };

  const doneCount = items.filter(i => i.done).length;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ListChecks className="w-3.5 h-3.5" />
        <span>Pauta da reunião</span>
        {items.length > 0 && (
          <span className="ml-auto tabular-nums">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {items.length > 0 && (
        <ul className="space-y-1.5 rounded-md border border-border bg-card/40 p-2">
          {items.map(item => (
            <li
              key={item.id}
              className="flex items-center gap-2 text-sm group"
            >
              <Checkbox
                checked={item.done}
                onCheckedChange={() => !readOnly && toggle(item.id)}
                disabled={readOnly}
                className="shrink-0"
              />
              <span
                className={cn(
                  'flex-1 leading-snug break-words',
                  item.done && 'line-through text-muted-foreground',
                )}
              >
                {item.text}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition shrink-0"
                  aria-label="Remover item"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            placeholder="Adicionar item à pauta…"
            className="h-9 text-sm"
          />
          <Button type="button" size="sm" variant="outline" onClick={add} disabled={!draft.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
