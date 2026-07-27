import { useState, KeyboardEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, Loader2, Plus, X } from 'lucide-react';
import {
  useCompanyNotificationPrefs,
  useUpdateCompanyNotificationPrefs,
} from '@/hooks/useCompanyNotificationPrefs';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NotificationPrefsCard() {
  const { data, isLoading } = useCompanyNotificationPrefs();
  const update = useUpdateCompanyNotificationPrefs();
  const [emailInput, setEmailInput] = useState('');

  const prefs = data;

  const addEmail = () => {
    const e = emailInput.trim().toLowerCase();
    if (!EMAIL_RE.test(e)) return;
    if (prefs?.email_recipients.includes(e)) {
      setEmailInput('');
      return;
    }
    update.mutate({ email_recipients: [...(prefs?.email_recipients ?? []), e] });
    setEmailInput('');
  };

  const removeEmail = (e: string) => {
    update.mutate({
      email_recipients: (prefs?.email_recipients ?? []).filter((x) => x !== e),
    });
  };

  const handleKey = (ev: KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      addEmail();
    }
  };

  return (
    <Card className="glass-card p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Bell className="w-5 h-5 text-primary" />
        <div>
          <h2 className="font-display text-lg font-semibold">Notificações por e-mail</h2>
          <p className="text-xs text-muted-foreground">
            Configure quando e quem recebe alertas da plataforma.
          </p>
        </div>
      </div>

      {isLoading || !prefs ? (
        <div className="py-6 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <ToggleRow
              label="Novo lead"
              description="Avisa quando um novo lead é criado ou recebido."
              checked={prefs.email_new_lead}
              onChange={(v) => update.mutate({ email_new_lead: v })}
            />
            <ToggleRow
              label="Nova mensagem"
              description="Avisa quando uma nova conversa começa em qualquer canal."
              checked={prefs.email_new_message}
              onChange={(v) => update.mutate({ email_new_message: v })}
            />
            <ToggleRow
              label="Resumo diário"
              description="Envia um resumo da operação no horário escolhido."
              checked={prefs.email_daily_report}
              onChange={(v) => update.mutate({ email_daily_report: v })}
            />
          </div>

          {prefs.email_daily_report && (
            <div className="space-y-2 pl-1">
              <Label className="text-xs">Hora do resumo diário</Label>
              <Select
                value={String(prefs.daily_report_hour)}
                onValueChange={(v) => update.mutate({ daily_report_hour: Number(v) })}
              >
                <SelectTrigger className="w-32 bg-secondary/50 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {String(i).padStart(2, '0')}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-border/50">
            <Label className="text-sm">Destinatários adicionais</Label>
            <p className="text-xs text-muted-foreground">
              Se vazio, os e-mails vão para todos os administradores da empresa.
            </p>
            <div className="flex gap-2">
              <Input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="email@empresa.com"
                className="bg-secondary/50 border-border/50"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={addEmail}
                disabled={!EMAIL_RE.test(emailInput.trim().toLowerCase())}
              >
                <Plus className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            </div>
            {prefs.email_recipients.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {prefs.email_recipients.map((e) => (
                  <Badge key={e} variant="secondary" className="gap-1 pr-1">
                    {e}
                    <button
                      type="button"
                      onClick={() => removeEmail(e)}
                      className="ml-1 rounded hover:bg-muted p-0.5"
                      aria-label={`Remover ${e}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border border-border/50 bg-card/40 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
