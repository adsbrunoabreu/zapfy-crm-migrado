import { Label } from '@/components/ui/label';

import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { RatingConfig } from '@/hooks/useAttendanceSettings';

interface Props {
  value: RatingConfig;
  onChange: (v: RatingConfig) => void;
}

export default function RatingSection({ value, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Avaliação de atendimento</h2>
        <p className="text-sm text-muted-foreground">Coleta de feedback após o encerramento.</p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
        <div>
          <Label>Enviar avaliação automaticamente</Label>
          <p className="text-xs text-muted-foreground">Após encerrar o atendimento</p>
        </div>
        <Switch checked={value.enabled} onCheckedChange={(c) => onChange({ ...value, enabled: c })} />
      </div>

      {value.enabled && (
        <>
          <div className="space-y-2 max-w-sm">
            <Label>Tipo de escala</Label>
            <Select
              value={value.scale}
              onValueChange={(v) => onChange({ ...value, scale: v as RatingConfig['scale'] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stars">Estrelas (1-5)</SelectItem>
                <SelectItem value="emojis">Emojis (😞 😐 😊)</SelectItem>
                <SelectItem value="nps">NPS (0-10)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
            <div>
              <Label>Permitir comentário opcional</Label>
              <p className="text-xs text-muted-foreground">Cliente pode escrever observações</p>
            </div>
            <Switch checked={value.allow_comment} onCheckedChange={(c) => onChange({ ...value, allow_comment: c })} />
          </div>

          <div className="space-y-2 max-w-sm">
            <Label>Prazo para encerrar após o pedido de avaliação</Label>
            <Select
              value={String(value.response_window_hours || 12)}
              onValueChange={(v) =>
                onChange({ ...value, response_window_hours: parseInt(v, 10) })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="6">6 horas</SelectItem>
                <SelectItem value="12">12 horas</SelectItem>
                <SelectItem value="24">24 horas</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              O atendimento fica em "Aguardando avaliação" até o cliente responder ou esgotar o prazo.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Mensagem de solicitação</Label>
            <Textarea
              rows={3}
              value={value.request_message}
              onChange={(e) => onChange({ ...value, request_message: e.target.value })}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
            <div>
              <Label>Bloquear múltiplas avaliações</Label>
              <p className="text-xs text-muted-foreground">Apenas uma avaliação por atendimento</p>
            </div>
            <Switch checked={value.block_multiple} onCheckedChange={(c) => onChange({ ...value, block_multiple: c })} />
          </div>
        </>
      )}
    </div>
  );
}
