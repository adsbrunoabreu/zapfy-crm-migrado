import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import type { TicketsConfig, Priority } from '@/hooks/useAttendanceSettings';
import { useState } from 'react';

interface Props {
  value: TicketsConfig;
  onChange: (v: TicketsConfig) => void;
}

export default function TicketsSection({ value, onChange }: Props) {
  const [newCategory, setNewCategory] = useState('');

  const updatePriority = (idx: number, patch: Partial<Priority>) => {
    const next = [...value.priorities];
    next[idx] = { ...next[idx], ...patch };
    onChange({ ...value, priorities: next });
  };
  const addPriority = () => {
    onChange({
      ...value,
      priorities: [...value.priorities, { name: 'Nova', color: '#6366f1', enabled: true }],
    });
  };
  const removePriority = (idx: number) => {
    onChange({ ...value, priorities: value.priorities.filter((_, i) => i !== idx) });
  };

  const addCategory = () => {
    const v = newCategory.trim();
    if (!v) return;
    if (value.categories.includes(v)) return;
    onChange({ ...value, categories: [...value.categories, v] });
    setNewCategory('');
  };
  const removeCategory = (c: string) => {
    onChange({ ...value, categories: value.categories.filter((x) => x !== c) });
  };

  const nextNumberPreview = `${value.prefix || 'ATD'}-${String(value.next_number).padStart(5, '0')}`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Tickets de atendimento</h2>
        <p className="text-sm text-muted-foreground">Numeração, prioridades e categorias.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
        <div className="space-y-2">
          <Label>Prefixo do ticket</Label>
          <Input
            value={value.prefix}
            maxLength={5}
            onChange={(e) =>
              onChange({ ...value, prefix: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) })
            }
          />
          <p className="text-xs text-muted-foreground">Máx. 5 caracteres, letras.</p>
        </div>
        <div className="space-y-2">
          <Label>Próximo número</Label>
          <Input value={nextNumberPreview} readOnly className="bg-secondary/50" />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
          <div>
            <Label>Exibir canal de origem no ticket</Label>
            <p className="text-xs text-muted-foreground">Mostra de onde veio o atendimento (WhatsApp, site, etc.)</p>
          </div>
          <Switch checked={value.show_channel} onCheckedChange={(c) => onChange({ ...value, show_channel: c })} />
        </div>

        <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
          <div>
            <Label>Observações internas (apenas agentes)</Label>
            <p className="text-xs text-muted-foreground">Notas privadas não vistas pelo cliente</p>
          </div>
          <Switch
            checked={value.show_internal_notes}
            onCheckedChange={(c) => onChange({ ...value, show_internal_notes: c })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
        <div>
          <Label>Criar ticket automaticamente</Label>
          <p className="text-xs text-muted-foreground">
            Quando ligado, toda nova conversa abre um ticket. Quando desligado, o agente abre manualmente pelo botão "Abrir ticket" no chat. A atribuição ao agente online continua automática nos dois modos.
          </p>
        </div>
        <Switch
          checked={!!value.auto_create}
          onCheckedChange={(c) => onChange({ ...value, auto_create: c })}
        />
      </div>

      <div className="space-y-2 max-w-sm">
        <Label>Modo de atribuição</Label>
        <Select
          value={value.assignment_mode}
          onValueChange={(v) => onChange({ ...value, assignment_mode: v as TicketsConfig['assignment_mode'] })}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="online_least_load">Online + menor carga (recomendado)</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="round_robin">Rodízio (round-robin)</SelectItem>
            <SelectItem value="least_load">Menor carga</SelectItem>
            <SelectItem value="queue">Por fila</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Prioridades */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Prioridades</Label>
          <Button size="sm" variant="outline" onClick={addPriority}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
        <div className="space-y-2">
          {value.priorities.map((p, idx) => (
            <div key={idx} className="flex items-center gap-2 p-2 rounded-md border border-border bg-secondary/30">
              <Switch checked={p.enabled} onCheckedChange={(c) => updatePriority(idx, { enabled: c })} />
              <Input
                value={p.name}
                onChange={(e) => updatePriority(idx, { name: e.target.value })}
                className="h-9 flex-1"
              />
              <input
                type="color"
                value={p.color}
                onChange={(e) => updatePriority(idx, { color: e.target.value })}
                className="h-9 w-12 rounded border border-border bg-transparent cursor-pointer"
              />
              <Button size="icon" variant="ghost" onClick={() => removePriority(idx)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Categorias */}
      <div className="space-y-2">
        <Label>Categorias de atendimento</Label>
        <div className="flex gap-2">
          <Input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
            placeholder="Nome da categoria"
            className="h-9"
          />
          <Button onClick={addCategory} variant="outline">
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {value.categories.map((c) => (
            <Badge key={c} variant="secondary" className="gap-1.5 pl-2.5">
              {c}
              <button onClick={() => removeCategory(c)} className="hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {value.categories.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma categoria.</p>
          )}
        </div>
      </div>
    </div>
  );
}
