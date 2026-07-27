import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { ClosingConfig } from '@/hooks/useAttendanceSettings';

interface Props {
  value: ClosingConfig;
  onChange: (v: ClosingConfig) => void;
}

export default function ClosingSection({ value, onChange }: Props) {
  const [newReason, setNewReason] = useState('');

  const addReason = () => {
    const v = newReason.trim();
    if (!v || value.reasons.includes(v)) return;
    onChange({ ...value, reasons: [...value.reasons, v] });
    setNewReason('');
  };
  const removeReason = (r: string) => {
    onChange({ ...value, reasons: value.reasons.filter((x) => x !== r) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Encerramento de atendimento</h2>
        <p className="text-sm text-muted-foreground">Defina como conversas serão encerradas.</p>
      </div>

      <div className="space-y-2">
        <Label>Mensagem de encerramento</Label>
        <Textarea
          rows={3}
          value={value.closing_message}
          onChange={(e) => onChange({ ...value, closing_message: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label>Motivos de encerramento</Label>
        <div className="flex gap-2">
          <Input
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addReason())}
            placeholder="Novo motivo"
            className="h-9"
          />
          <Button variant="outline" onClick={addReason}>
            <Plus className="w-4 h-4 mr-1" /> Adicionar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          {value.reasons.map((r) => (
            <Badge key={r} variant="secondary" className="gap-1.5 pl-2.5">
              {r}
              <button onClick={() => removeReason(r)} className="hover:text-destructive">
                <Trash2 className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2 max-w-sm">
        <Label>Encerramento automático por inatividade (minutos)</Label>
        <Input
          type="number"
          min={0}
          value={value.inactivity_minutes}
          onChange={(e) => onChange({ ...value, inactivity_minutes: Math.max(0, parseInt(e.target.value || '0', 10)) })}
        />
        <p className="text-xs text-muted-foreground">0 desativa o encerramento automático.</p>
      </div>

      <div className="p-3 rounded-md border border-border bg-secondary/30 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label>Permitir reabertura pelo cliente</Label>
            <p className="text-xs text-muted-foreground">Cliente pode reabrir o ticket dentro do prazo</p>
          </div>
          <Switch checked={value.allow_reopen} onCheckedChange={(c) => onChange({ ...value, allow_reopen: c })} />
        </div>
        {value.allow_reopen && (
          <div className="space-y-2 max-w-xs">
            <Label>Prazo para reabertura (horas)</Label>
            <Input
              type="number"
              min={1}
              value={value.reopen_window_hours}
              onChange={(e) =>
                onChange({ ...value, reopen_window_hours: Math.max(1, parseInt(e.target.value || '1', 10)) })
              }
            />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30 opacity-70">
        <div>
          <Label>Preservar histórico após encerramento</Label>
          <p className="text-xs text-muted-foreground">Sempre ativo. Não pode ser desativado.</p>
        </div>
        <Switch checked disabled />
      </div>
    </div>
  );
}
