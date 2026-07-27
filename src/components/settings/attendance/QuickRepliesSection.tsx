import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import type { QuickReply } from '@/hooks/useAttendanceSettings';

interface Props {
  value: QuickReply[];
  onChange: (v: QuickReply[]) => void;
}

const normalizeShortcut = (s: string) => {
  let v = s.replace(/\s+/g, '').toLowerCase();
  if (!v.startsWith('/')) v = '/' + v.replace(/^\/+/, '');
  return v.slice(0, 30);
};

export default function QuickRepliesSection({ value, onChange }: Props) {
  const add = () => {
    onChange([...value, { id: crypto.randomUUID(), shortcut: '/', text: '' }]);
  };
  const update = (id: string, patch: Partial<QuickReply>) => {
    onChange(value.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const remove = (id: string) => {
    onChange(value.filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold">Mensagens pré-definidas</h2>
          <p className="text-sm text-muted-foreground">
            Use atalhos digitando <code className="text-xs px-1 rounded bg-secondary">/</code> no chat. Globais para toda a equipe.
          </p>
        </div>
        <Button variant="outline" onClick={add}>
          <Plus className="w-4 h-4 mr-1" /> Adicionar
        </Button>
      </div>

      {value.length === 0 && (
        <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
          Nenhuma mensagem cadastrada.
        </div>
      )}

      <div className="space-y-2">
        {value.map((r) => (
          <div key={r.id} className="grid grid-cols-1 md:grid-cols-[180px_1fr_auto] gap-2 p-3 rounded-md border border-border bg-secondary/30 items-start">
            <Input
              placeholder="/atalho"
              value={r.shortcut}
              onChange={(e) => update(r.id, { shortcut: normalizeShortcut(e.target.value) })}
              className="h-9 font-mono"
            />
            <Textarea
              rows={2}
              placeholder="Texto da mensagem"
              value={r.text}
              onChange={(e) => update(r.id, { text: e.target.value })}
              className="min-h-[36px]"
            />
            <Button size="icon" variant="ghost" onClick={() => remove(r.id)}>
              <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
