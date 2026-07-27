import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { SignatureConfig } from '@/hooks/useAttendanceSettings';

interface Props {
  value: SignatureConfig;
  onChange: (v: SignatureConfig) => void;
  agentName: string;
  agentAvatar: string | null;
}

const renderSignature = (cfg: SignatureConfig, name: string) => {
  switch (cfg.format) {
    case 'bold_name':
      return `*${name}*`;
    case 'attended_by':
      return `Atendido por: ${name}`;
    case 'name_dash':
      return `${name} — Suporte`;
    case 'custom':
      return (cfg.custom_template || '').split('{{nome_agente}}').join(name);
  }
};

export default function SignatureSection({ value, onChange, agentName, agentAvatar }: Props) {
  const preview = renderSignature(value, agentName);
  const initials = agentName.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-semibold">Assinatura do agente</h2>
        <p className="text-sm text-muted-foreground">Como o nome do agente aparece nas mensagens.</p>
      </div>

      <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
        <div>
          <Label>Exibir assinatura nas mensagens</Label>
          <p className="text-xs text-muted-foreground">Anexa o nome do agente automaticamente</p>
        </div>
        <Switch checked={value.enabled} onCheckedChange={(c) => onChange({ ...value, enabled: c })} />
      </div>

      {value.enabled && (
        <>
          <div className="space-y-2 max-w-sm">
            <Label>Formato</Label>
            <Select
              value={value.format}
              onValueChange={(v) => onChange({ ...value, format: v as SignatureConfig['format'] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bold_name">*Nome do Agente*</SelectItem>
                <SelectItem value="attended_by">Atendido por: Nome do Agente</SelectItem>
                <SelectItem value="name_dash">Nome do Agente — Suporte</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 max-w-sm">
            <Label>Posição na mensagem</Label>
            <Select
              value={value.position ?? 'top'}
              onValueChange={(v) => onChange({ ...value, position: v as 'top' | 'bottom' })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Acima da mensagem (padrão)</SelectItem>
                <SelectItem value="bottom">Abaixo da mensagem</SelectItem>
              </SelectContent>
            </Select>
          </div>


          {value.format === 'custom' && (
            <div className="space-y-2">
              <Label>Template personalizado</Label>
              <Textarea
                rows={3}
                value={value.custom_template}
                onChange={(e) => onChange({ ...value, custom_template: e.target.value })}
                placeholder="Ex: — {{nome_agente}}, sua equipe"
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="px-1 rounded bg-secondary">{'{{nome_agente}}'}</code> para inserir o nome.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between p-3 rounded-md border border-border bg-secondary/30">
            <div>
              <Label>Mostrar avatar do agente</Label>
              <p className="text-xs text-muted-foreground">Exibe a foto junto da assinatura</p>
            </div>
            <Switch checked={value.show_avatar} onCheckedChange={(c) => onChange({ ...value, show_avatar: c })} />
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>Pré-visualização</Label>
            <div className="p-4 rounded-md border border-border bg-secondary/30">
              <div className="flex items-start gap-2">
                {value.show_avatar && (
                  <Avatar className="w-8 h-8">
                    {agentAvatar && <AvatarImage src={agentAvatar} />}
                    <AvatarFallback>{initials || 'A'}</AvatarFallback>
                  </Avatar>
                )}
                <div className="flex-1 bg-primary/10 rounded-lg p-3 text-sm whitespace-pre-line">
                  {(value.position ?? 'top') === 'top' ? (
                    <>
                      <span className="text-muted-foreground">{preview}</span>
                      {'\n\n'}
                      Olá! Como posso ajudar?
                    </>
                  ) : (
                    <>
                      Olá! Como posso ajudar?
                      {'\n\n'}
                      <span className="text-muted-foreground">{preview}</span>
                    </>
                  )}
                </div>

              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
