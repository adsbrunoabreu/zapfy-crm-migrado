import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { GeneralConfig } from '@/hooks/useAttendanceSettings';

interface Props {
  value: GeneralConfig;
  onChange: (v: GeneralConfig) => void;
}

export default function GeneralSection({ value, onChange }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Configurações gerais</h2>
        <p className="text-sm text-muted-foreground">Limites, mensagens e regras globais.</p>
      </div>

      <div className="space-y-2 max-w-xs">
        <Label>Limite de atendimentos simultâneos por agente</Label>
        <Input
          type="number"
          min={1}
          value={value.max_concurrent_per_agent}
          onChange={(e) =>
            onChange({ ...value, max_concurrent_per_agent: Math.max(1, parseInt(e.target.value || '1', 10)) })
          }
        />
      </div>

      <div className="space-y-2">
        <Label>Mensagem de boas-vindas</Label>
        <Textarea
          rows={3}
          value={value.welcome_message}
          onChange={(e) => onChange({ ...value, welcome_message: e.target.value })}
        />
      </div>

      <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
        <div>
          <Label>Exibir tempo estimado de espera ao cliente</Label>
          <p className="text-xs text-muted-foreground">Mostra previsão antes do atendimento iniciar</p>
        </div>
        <Switch checked={value.show_wait_time} onCheckedChange={(c) => onChange({ ...value, show_wait_time: c })} />
      </div>

      <div className="space-y-2 max-w-xs">
        <Label>Alerta para supervisor (minutos sem resposta)</Label>
        <Input
          type="number"
          min={0}
          value={value.supervisor_alert_minutes}
          onChange={(e) =>
            onChange({ ...value, supervisor_alert_minutes: Math.max(0, parseInt(e.target.value || '0', 10)) })
          }
        />
        <p className="text-xs text-muted-foreground">0 desativa o alerta.</p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
        <div>
          <Label>Permitir transferência entre atendentes</Label>
          <p className="text-xs text-muted-foreground">O histórico do ticket é preservado na transferência</p>
        </div>
        <Switch checked={value.allow_transfer} onCheckedChange={(c) => onChange({ ...value, allow_transfer: c })} />
      </div>
    </div>
  );
}
