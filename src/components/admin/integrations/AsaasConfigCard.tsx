import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSystemIntegrations, useUpsertIntegration } from '@/hooks/useSystemIntegrations';
import { callAsaas } from '@/hooks/useAsaas';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CreditCard, CheckCircle2, AlertCircle, Copy, ExternalLink, Loader2, Bell, FileText } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

export const AsaasConfigCard = () => {
  const { data: cfgs } = useSystemIntegrations();
  const upsert = useUpsertIntegration();
  const cfg = cfgs?.asaas?.value || {};

  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState<'sandbox' | 'live'>('sandbox');
  const [defaultDueDays, setDefaultDueDays] = useState(3);
  const [methods, setMethods] = useState({ pix: true, credit_card: false, boleto: false });
  const [testing, setTesting] = useState(false);
  const [firingTest, setFiringTest] = useState(false);

  // Alertas
  const [alertsEnabled, setAlertsEnabled] = useState(false);
  const [threshold, setThreshold] = useState(5);
  const [windowMinutes, setWindowMinutes] = useState(15);
  const [cooldownMinutes, setCooldownMinutes] = useState(60);
  const [extraEmails, setExtraEmails] = useState('');
  const [alertWebhookUrl, setAlertWebhookUrl] = useState('');
  const lastAlertedAt = (cfg as any)?.alerts?.last_alerted_at as string | undefined;

  useEffect(() => {
    setEnabled(!!cfg.enabled);
    setEnvironment(cfg.environment === 'live' ? 'live' : 'sandbox');
    setDefaultDueDays(Number(cfg.default_due_days) || 3);
    const m = (cfg as any).methods || {};
    setMethods({
      pix: m.pix !== undefined ? !!m.pix : true,
      credit_card: !!m.credit_card,
      boleto: !!m.boleto,
    });
    const a = (cfg as any).alerts || {};
    setAlertsEnabled(!!a.enabled);
    setThreshold(Number(a.threshold) || 5);
    setWindowMinutes(Number(a.window_minutes) || 15);
    setCooldownMinutes(Number(a.cooldown_minutes) || 60);
    setExtraEmails(Array.isArray(a.extra_emails) ? a.extra_emails.join(', ') : '');
    setAlertWebhookUrl(a.webhook_url || '');
  }, [cfg.enabled, cfg.environment, cfg.default_due_days, (cfg as any).methods, (cfg as any).alerts]);

  const save = async () => {
    if (!methods.pix && !methods.credit_card && !methods.boleto) {
      toast.error('Habilite ao menos um método de pagamento');
      return;
    }
    const emails = extraEmails
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes('@'));
    try {
      await upsert.mutateAsync({
        key: 'asaas',
        value: {
          ...cfg,
          enabled,
          environment,
          default_due_days: defaultDueDays,
          methods,
          alerts: {
            ...((cfg as any).alerts || {}),
            enabled: alertsEnabled,
            threshold,
            window_minutes: windowMinutes,
            cooldown_minutes: cooldownMinutes,
            extra_emails: emails,
            webhook_url: alertWebhookUrl.trim(),
          },
        },
      });
      toast.success('Configuração salva');
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  };

  const fireTestAlert = async () => {
    setFiringTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('asaas-failure-alerts', { body: { force: true } });
      if (error) throw error;
      if ((data as any)?.fired) toast.success('Alerta de teste enviado');
      else toast.info('Função executada — sem destinatários ou nenhum log para amostrar');
    } catch (e: any) {
      toast.error(e?.message || 'Falha ao disparar alerta');
    } finally {
      setFiringTest(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    try {
      const data = await callAsaas<any>('ping');
      if (!data?.ok) throw new Error('Falha na conexão. Verifique a API Key.');
      toast.success(`Conectado em ${data.environment} · ${data.account?.name || data.account?.email || 'conta válida'}`);
    } catch (e: any) {
      toast.error(e?.message || 'Falha na conexão');
    } finally {
      setTesting(false);
    }
  };

  const projectRef = (import.meta.env.VITE_SUPABASE_URL || '').match(/https:\/\/(.+?)\.supabase\.co/)?.[1] || '';
  const webhookUrl = projectRef ? `https://${projectRef}.supabase.co/functions/v1/asaas-webhook` : '';

  const copy = (txt: string, label: string) => {
    navigator.clipboard.writeText(txt);
    toast.success(`${label} copiado`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" /> Asaas (Pagamentos)
            </CardTitle>
            <CardDescription>Cobrança recorrente por cartão e Pix com checkout inline</CardDescription>
          </div>
          {enabled ? (
            <Badge variant="outline" className="text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)]">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.30)]">
              <AlertCircle className="h-3 w-3 mr-1" /> Desligado
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded border border-border p-3 bg-muted/20 text-xs">
          A <b>API Key</b> e o <b>Webhook Token</b> do Asaas ficam em secrets seguros (<code>ASAAS_API_KEY</code>,{' '}
          <code>ASAAS_WEBHOOK_TOKEN</code>). Para alterá-los, use o gerenciador de secrets do projeto.
        </div>

        <div className="flex items-center justify-between rounded border border-border p-3">
          <div>
            <div className="text-sm font-medium">Cobrança automática habilitada</div>
            <div className="text-xs text-muted-foreground">Quando ligado, novas assinaturas usam o Asaas para cobrança recorrente.</div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Ambiente</Label>
            <Select value={environment} onValueChange={(v: 'sandbox' | 'live') => setEnvironment(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (testes)</SelectItem>
                <SelectItem value="live">Produção</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Dias até vencimento (1ª cobrança)</Label>
            <Input type="number" min={0} max={30} value={defaultDueDays} onChange={(e) => setDefaultDueDays(Number(e.target.value))} />
          </div>
        </div>

        <div className="rounded border border-border p-3 space-y-3">
          <div>
            <div className="text-sm font-medium">Métodos de pagamento aceitos no checkout</div>
            <div className="text-xs text-muted-foreground">Controla quais abas aparecem na tela de assinatura para o cliente.</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex items-center justify-between rounded border border-border p-3 cursor-pointer">
              <div>
                <div className="text-sm font-medium">Pix</div>
                <div className="text-[11px] text-muted-foreground">QR Code automático</div>
              </div>
              <Switch checked={methods.pix} onCheckedChange={(v) => setMethods((m) => ({ ...m, pix: v }))} />
            </label>
            <label className="flex items-center justify-between rounded border border-border p-3 cursor-pointer">
              <div>
                <div className="text-sm font-medium">Cartão de crédito</div>
                <div className="text-[11px] text-muted-foreground">Cobrança recorrente automática</div>
              </div>
              <Switch checked={methods.credit_card} onCheckedChange={(v) => setMethods((m) => ({ ...m, credit_card: v }))} />
            </label>
            <label className="flex items-center justify-between rounded border border-border p-3 cursor-pointer">
              <div>
                <div className="text-sm font-medium">Boleto</div>
                <div className="text-[11px] text-muted-foreground">Boleto bancário com vencimento</div>
              </div>
              <Switch checked={methods.boleto} onCheckedChange={(v) => setMethods((m) => ({ ...m, boleto: v }))} />
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <Label>URL do Webhook</Label>
          <div className="flex gap-2">
            <Input readOnly value={webhookUrl} />
            <Button variant="outline" size="icon" onClick={() => copy(webhookUrl, 'URL')}><Copy className="h-4 w-4" /></Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure no painel do Asaas: <b>Integrações → Webhooks</b>. Use o token <code>ASAAS_WEBHOOK_TOKEN</code> como header <code>asaas-access-token</code>.
            Eventos: PAYMENT_*.
          </p>
        </div>

        {/* Alertas de falhas repetidas */}
        <div className="rounded border border-border p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" /> Alertas de falhas repetidas
              </div>
              <div className="text-xs text-muted-foreground">
                Envia e-mail (Master + admins + extras) e POST para um webhook quando houver falhas acima do limite na janela.
              </div>
            </div>
            <Switch checked={alertsEnabled} onCheckedChange={setAlertsEnabled} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Falhas (≥)</Label>
              <Input type="number" min={1} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} disabled={!alertsEnabled} />
            </div>
            <div>
              <Label>Janela (min)</Label>
              <Input type="number" min={1} value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value))} disabled={!alertsEnabled} />
            </div>
            <div>
              <Label>Cooldown (min)</Label>
              <Input type="number" min={5} value={cooldownMinutes} onChange={(e) => setCooldownMinutes(Number(e.target.value))} disabled={!alertsEnabled} />
            </div>
          </div>

          <div>
            <Label>E-mails extras (separados por vírgula)</Label>
            <Textarea
              rows={2}
              value={extraEmails}
              onChange={(e) => setExtraEmails(e.target.value)}
              placeholder="dev@empresa.com, ops@empresa.com"
              disabled={!alertsEnabled}
            />
          </div>

          <div>
            <Label>Webhook URL (opcional)</Label>
            <Input
              value={alertWebhookUrl}
              onChange={(e) => setAlertWebhookUrl(e.target.value)}
              placeholder="https://seu-endpoint/alertas-asaas"
              disabled={!alertsEnabled}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              POST JSON com <code>{`{ type, failures, window_minutes, threshold, logs_url, sample[] }`}</code>.
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-muted-foreground">
              {lastAlertedAt
                ? `Último disparo: ${new Date(lastAlertedAt).toLocaleString('pt-BR')}`
                : 'Nenhum alerta disparado ainda'}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="#asaas-logs"><FileText className="h-3.5 w-3.5 mr-1.5" /> Ver logs</a>
              </Button>
              <Button variant="outline" size="sm" onClick={fireTestAlert} disabled={firingTest}>
                {firingTest ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Bell className="h-3.5 w-3.5 mr-1.5" />}
                Disparar teste
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-2 pt-2">
          <Button variant="outline" onClick={testConnection} disabled={testing}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
            Testar conexão
          </Button>
          <Button onClick={save} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
