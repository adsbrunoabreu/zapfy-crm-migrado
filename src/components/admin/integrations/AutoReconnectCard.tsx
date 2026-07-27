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
import { RotateCw, Loader2, Play, Save } from 'lucide-react';

interface ReconnectConfig {
  enabled: boolean;
  max_attempts: number;
}

const DEFAULTS: ReconnectConfig = {
  enabled: false,
  max_attempts: 8,
};

const BACKOFF_LABEL = '1m → 2m → 5m → 10m → 30m → 1h → 2h → 4h';

export const AutoReconnectCard = () => {
  const { data: cfgs } = useSystemIntegrations();
  const upsert = useUpsertIntegration();
  const stored = (cfgs?.instance_auto_reconnect?.value as ReconnectConfig | undefined) || DEFAULTS;

  const [cfg, setCfg] = useState<ReconnectConfig>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setCfg({ ...DEFAULTS, ...stored });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfgs?.instance_auto_reconnect?.value]);

  const save = async () => {
    setSaving(true);
    try {
      await upsert.mutateAsync({ key: 'instance_auto_reconnect', value: cfg as any });
      toast.success('Configuração salva');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-reconnect-instances');
      if (error) throw error;
      if (data?.skipped) {
        toast.info('Auto-reconexão está desativada');
      } else {
        toast.success(
          `Tentativas: ${data?.attempted || 0} • Sucesso: ${data?.succeeded || 0} • Aguardando: ${data?.waiting || 0}`
        );
      }
    } catch (e: any) {
      toast.error(e?.context?.error || e?.message || 'Erro ao executar');
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
              <RotateCw className="h-5 w-5" /> Reconexão automática
            </CardTitle>
            <CardDescription>
              Tenta reconectar instâncias offline com backoff exponencial
            </CardDescription>
          </div>
          <Badge variant={cfg.enabled ? 'default' : 'outline'}>
            {cfg.enabled ? 'Ativa' : 'Desativada'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label className="text-base">Ativar reconexão automática</Label>
            <p className="text-xs text-muted-foreground">
              Verifica a cada minuto e dispara connect na Evolution
            </p>
          </div>
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(v) => setCfg({ ...cfg, enabled: v })}
          />
        </div>

        <div className="space-y-2">
          <Label>Limite de tentativas (1 a 8)</Label>
          <Input
            type="number"
            min={1}
            max={8}
            value={cfg.max_attempts}
            onChange={(e) =>
              setCfg({ ...cfg, max_attempts: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })
            }
          />
          <p className="text-xs text-muted-foreground">
            Backoff cumulativo: <span className="font-mono">{BACKOFF_LABEL}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Após esgotar, a instância é marcada como "desistida" até reconectar manualmente.
          </p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
          <Button variant="outline" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Executar agora
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
