import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useSystemIntegrations, useUpsertIntegration } from '@/hooks/useSystemIntegrations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Bell, Loader2, Mail, Plus, Save, Send, Trash2 } from 'lucide-react';

interface AlertConfig {
  enabled: boolean;
  threshold_minutes: number;
  extra_emails: string[];
}

const DEFAULTS: AlertConfig = {
  enabled: false,
  threshold_minutes: 15,
  extra_emails: [],
};

export const InstanceAlertsCard = () => {
  const { data: cfgs } = useSystemIntegrations();
  const upsert = useUpsertIntegration();
  const stored = (cfgs?.instance_alerts?.value as AlertConfig | undefined) || DEFAULTS;

  const [cfg, setCfg] = useState<AlertConfig>(DEFAULTS);
  const [newEmail, setNewEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setCfg({ ...DEFAULTS, ...stored });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgs?.instance_alerts?.value]);

  const save = async () => {
    setSaving(true);
    try {
      await upsert.mutateAsync({ key: 'instance_alerts', value: cfg as any });
      toast.success('Configuração salva');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!e || !e.includes('@')) return toast.error('E-mail inválido');
    if (cfg.extra_emails.includes(e)) return toast.error('Já adicionado');
    setCfg({ ...cfg, extra_emails: [...cfg.extra_emails, e] });
    setNewEmail('');
  };

  const removeEmail = (e: string) => {
    setCfg({ ...cfg, extra_emails: cfg.extra_emails.filter((x) => x !== e) });
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('monitor-instance-health', { body: {} });
      if (error) {
        let msg = error.message;
        try { msg = (error as any).context?.json?.error || msg; } catch { /* */ }
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || 'Falha');
      toast.success(
        data.skipped
          ? 'Monitor desabilitado (ative para rodar)'
          : `Verificadas ${data.checked || 0} · alertas ${data.alerts_sent || 0} · recoveries ${data.recoveries_sent || 0}`
      );
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" /> Alertas de instâncias desconectadas
            </CardTitle>
            <CardDescription>
              Envia e-mail automático quando uma instância fica offline acima do limite definido.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cfg.enabled
              ? 'text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)] bg-[hsl(var(--emerald)/0.10)]'
              : 'text-muted-foreground border-border bg-muted'}
          >
            {cfg.enabled ? 'Ativo' : 'Inativo'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded border border-border bg-muted/30 p-3">
          <div>
            <p className="text-sm font-medium">Habilitar monitoramento</p>
            <p className="text-xs text-muted-foreground">Verificação automática a cada 1 minuto</p>
          </div>
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })}
          />
        </div>

        <div>
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Tempo offline antes do alerta
          </Label>
          <div className="flex items-center gap-2 mt-1">
            <Input
              type="number"
              min={1}
              max={1440}
              value={cfg.threshold_minutes}
              onChange={(e) => setCfg({ ...cfg, threshold_minutes: Math.max(1, Number(e.target.value) || 15) })}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">minutos</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Recomendado entre 5 e 30 minutos para evitar falsos positivos em quedas curtas.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Destinatários
          </Label>
          <div className="rounded border border-border bg-muted/30 p-3 space-y-2 text-xs">
            <p className="text-muted-foreground">Por padrão recebem alerta:</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>Todos os usuários <b>Master</b> da plataforma</li>
              <li>Admin da empresa afetada (se a instância pertencer a uma)</li>
            </ul>
          </div>

          <Label className="text-[11px] text-muted-foreground pt-2">
            E-mails adicionais (opcional)
          </Label>
          <div className="flex gap-2">
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="alerta@empresa.com"
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addEmail())}
            />
            <Button type="button" variant="outline" onClick={addEmail}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {cfg.extra_emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {cfg.extra_emails.map((e) => (
                <Badge key={e} variant="outline" className="gap-1.5 pr-1">
                  <Mail className="h-3 w-3" /> {e}
                  <button
                    onClick={() => removeEmail(e)}
                    className="ml-1 rounded hover:bg-muted p-0.5"
                    type="button"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
          <Button variant="outline" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Executar verificação agora
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
          Comportamento: 1 e-mail é enviado quando a instância passa do tempo limite e mais 1 quando reconectar.
          Não há reenvio enquanto continuar offline.
        </p>
      </CardContent>
    </Card>
  );
};
