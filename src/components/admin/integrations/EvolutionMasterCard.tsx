import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSystemIntegrations, useUpsertIntegration } from '@/hooks/useSystemIntegrations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Server, CheckCircle2, AlertCircle, Zap, Send, Loader2, RefreshCw, Wifi, WifiOff } from 'lucide-react';

interface InstanceItem {
  name: string;
  state: string;
}

const stateColor = (s: string) => {
  if (s === 'open' || s === 'connected') return 'text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)] bg-[hsl(var(--emerald)/0.10)]';
  if (s === 'connecting') return 'text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.30)] bg-[hsl(var(--amber)/0.10)]';
  return 'text-muted-foreground border-border bg-muted';
};

const stateLabel = (s: string) => {
  if (s === 'open' || s === 'connected') return 'Conectado';
  if (s === 'connecting') return 'Conectando';
  if (s === 'close' || s === 'disconnected') return 'Desconectado';
  return 'Desconectado';
};

export const EvolutionMasterCard = () => {
  const { data: cfgs } = useSystemIntegrations();
  const upsert = useUpsertIntegration();
  const cfg = cfgs?.evolution_master?.value || {};

  const [testing, setTesting] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [instances, setInstances] = useState<InstanceItem[]>([]);
  const [heartbeats, setHeartbeats] = useState<{ ts: number; ms: number; ok: boolean }[]>([]);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [, setTick] = useState(0); // força re-render do "há Xs"

  // Test form
  const [testInstance, setTestInstance] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('Teste de envio via Evolution API Master ✅');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);

  const prevInstancesRef = useRef<Map<string, string>>(new Map());
  const prevOnlineRef = useRef<boolean | null>(null);

  const isConnectedState = (s: string) => s === 'open' || s === 'connected';

  const checkConnection = async (silent = false) => {
    if (!silent) setTesting(true);
    setErrorMsg(null);
    const t0 = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('master-evolution-instance', {
        body: { action: 'test' },
      });
      const ms = Date.now() - t0;
      setLatency(ms);
      setLastChecked(new Date());
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha');

      const list: InstanceItem[] = Array.isArray(data?.data)
        ? data.data.map((i: any) => ({
            name: i?.name || i?.instance?.instanceName || i?.instanceName || '—',
            state: i?.connectionStatus || i?.instance?.state || i?.state || 'unknown',
          }))
        : [];

      // Detecta transições conectado -> desconectado por instância
      const prev = prevInstancesRef.current;
      if (prev.size > 0) {
        list.forEach((i) => {
          const prevState = prev.get(i.name);
          if (prevState && isConnectedState(prevState) && !isConnectedState(i.state)) {
            toast.error(`⚠️ Instância "${i.name}" foi desconectada`, {
              description: `Estado mudou de ${prevState} para ${i.state}`,
              duration: 10000,
            });
            console.warn(`[alert:evo-master] ${i.name}: ${prevState} → ${i.state}`);
          }
        });
        prev.forEach((_prevState, name) => {
          if (!list.find((i) => i.name === name)) {
            toast.warning(`Instância "${name}" foi removida do servidor`);
          }
        });
      }
      prevInstancesRef.current = new Map(list.map((i) => [i.name, i.state]));

      setInstances(list);
      setOnline(true);
      if (prevOnlineRef.current === false) {
        toast.success('Evolution API Master voltou a responder');
      }
      prevOnlineRef.current = true;

      setHeartbeats((h) => [...h, { ts: Date.now(), ms, ok: true }].slice(-12));
      if (!testInstance && list[0]) setTestInstance(list[0].name);

      console.log(`[heartbeat:evo-master] ✓ ${ms}ms · ${list.length} instâncias`);

      await upsert.mutateAsync({
        key: 'evolution_master',
        value: { ...cfg, configured: true, last_tested_at: new Date().toISOString(), latency_ms: ms },
      });
    } catch (e: any) {
      const ms = Date.now() - t0;
      setOnline(false);
      if (prevOnlineRef.current !== false) {
        toast.error('Evolution API Master está offline', {
          description: e?.message || 'Sem resposta do servidor',
          duration: 10000,
        });
      }
      prevOnlineRef.current = false;
      setErrorMsg(e?.message || 'Erro desconhecido');
      setHeartbeats((h) => [...h, { ts: Date.now(), ms, ok: false }].slice(-12));
      console.warn(`[heartbeat:evo-master] ✗ ${ms}ms · ${e?.message}`);
    } finally {
      if (!silent) setTesting(false);
    }
  };

  useEffect(() => {
    checkConnection();
    // Auto-refresh silencioso a cada 15s
    const id = window.setInterval(() => checkConnection(true), 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick a cada 1s para atualizar "há Xs"
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const sendTest = async () => {
    if (!testInstance || !testPhone || !testMsg) {
      return toast.error('Preencha instância, telefone e mensagem');
    }
    setSending(true);
    setSendResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('master-evolution-instance', {
        body: { action: 'send_test', instance_name: testInstance, phone: testPhone, message: testMsg },
      });
      if (error) throw error;
      if (!data?.success) {
        setSendResult({ ok: false, text: data?.error || JSON.stringify(data?.data).slice(0, 300) });
        toast.error('Falha no envio');
      } else {
        setSendResult({ ok: true, text: 'Mensagem enviada!' });
        toast.success('Mensagem enviada');
      }
    } catch (e: any) {
      setSendResult({ ok: false, text: e?.message || 'Erro' });
      toast.error(e?.message || 'Erro');
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" /> Evolution API Master
            </CardTitle>
            <CardDescription>
              URL e API Key globais usadas para criar instâncias por empresa
            </CardDescription>
          </div>
          {online === null ? (
            <Badge variant="outline" className="text-muted-foreground border-border">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Verificando…
            </Badge>
          ) : online ? (
            <Badge variant="outline" className="text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)] bg-[hsl(var(--emerald)/0.10)]">
              <Wifi className="h-3 w-3 mr-1" /> Online {latency != null && `· ${latency}ms`}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[hsl(var(--rose))] border-[hsl(var(--rose)/0.30)] bg-[hsl(var(--rose)/0.10)]">
              <WifiOff className="h-3 w-3 mr-1" /> Offline
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Aviso de instâncias desconectadas */}
        {online && instances.length > 0 && (() => {
          const disc = instances.filter((i) => !isConnectedState(i.state));
          if (disc.length === 0) return null;
          return (
            <div className="rounded border border-[hsl(var(--amber)/0.40)] bg-[hsl(var(--amber)/0.10)] p-3 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-[hsl(var(--amber))] flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium text-[hsl(var(--amber))]">
                  {disc.length} instância{disc.length > 1 ? 's' : ''} desconectada{disc.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {disc.slice(0, 3).map((i) => i.name).join(', ')}
                  {disc.length > 3 && ` e +${disc.length - 3}`}
                </p>
              </div>
            </div>
          );
        })()}

        {/* Heartbeat live */}
        <div className="rounded border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Heartbeat ao vivo
            </Label>
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {lastChecked
                ? `há ${Math.max(0, Math.floor((Date.now() - lastChecked.getTime()) / 1000))}s · próximo em ${Math.max(0, 15 - Math.floor((Date.now() - lastChecked.getTime()) / 1000))}s`
                : '—'}
            </span>
          </div>
          <div className="flex items-end gap-1 h-10">
            {heartbeats.length === 0 ? (
              <p className="text-[10px] text-muted-foreground self-center">Aguardando primeira leitura…</p>
            ) : (
              heartbeats.map((h, idx) => {
                const max = Math.max(...heartbeats.map((x) => x.ms), 100);
                const pct = Math.max(8, (h.ms / max) * 100);
                return (
                  <div
                    key={idx}
                    className={`flex-1 rounded-t ${h.ok ? 'bg-[hsl(var(--emerald))]/70' : 'bg-[hsl(var(--rose)/0.7)]'}`}
                    style={{ height: `${pct}%` }}
                    title={`${new Date(h.ts).toLocaleTimeString('pt-BR')} · ${h.ms}ms ${h.ok ? '✓' : '✗'}`}
                  />
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{heartbeats.length}/12 amostras</span>
            {heartbeats.length > 0 && (
              <span className="tabular-nums">
                média {Math.round(heartbeats.reduce((s, h) => s + h.ms, 0) / heartbeats.length)}ms ·
                p95 {(() => {
                  const sorted = [...heartbeats].map((h) => h.ms).sort((a, b) => a - b);
                  return sorted[Math.floor(sorted.length * 0.95)] || 0;
                })()}ms
              </span>
            )}
          </div>
        </div>

        <div className="rounded border border-border p-3 bg-muted/30 text-xs space-y-1">
          <p>
            A <b>URL</b> e a <b>API Key</b> da Evolution API Master são armazenadas como secrets seguros do projeto
            (<code>EVOLUTION_MASTER_URL</code>, <code>EVOLUTION_MASTER_API_KEY</code>).
          </p>
          <p>Para alterar, use a opção de atualizar secret no painel do Lovable Cloud.</p>
        </div>

        {errorMsg && (
          <div className="rounded border border-[hsl(var(--rose)/0.30)] bg-[hsl(var(--rose)/0.10)] p-3 text-xs text-[hsl(var(--rose))]">
            <AlertCircle className="h-3.5 w-3.5 inline mr-1" /> {errorMsg}
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={() => checkConnection(false)} disabled={testing} variant="outline" size="sm">
            {testing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Reverificar agora
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Auto-refresh: 15s
          </span>
        </div>

        {/* Instâncias */}
        {online && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Instâncias no servidor ({instances.length})
              </Label>
            </div>
            {instances.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma instância criada ainda.</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto rounded border border-border bg-muted/30 p-2">
                {instances.slice(0, 10).map((i) => (
                  <div key={i.name} className="flex items-center justify-between text-xs px-2 py-1">
                    <code className="font-mono">{i.name}</code>
                    <Badge variant="outline" className={`${stateColor(i.state)} text-[10px]`}>
                      {stateLabel(i.state)}
                    </Badge>
                  </div>
                ))}
                {instances.length > 10 && (
                  <p className="text-[10px] text-muted-foreground text-center pt-1">
                    +{instances.length - 10} outras
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Teste de envio */}
        {online && instances.length > 0 && (
          <div className="rounded border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              <h4 className="text-sm font-medium">Teste de envio</h4>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Instância</Label>
                <Select value={testInstance} onValueChange={setTestInstance}>
                  <SelectTrigger><SelectValue placeholder="Selecionar" /></SelectTrigger>
                  <SelectContent>
                    {instances.map((i) => (
                      <SelectItem key={i.name} value={i.name}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Telefone (com DDI)</Label>
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="5511999999999"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea value={testMsg} onChange={(e) => setTestMsg(e.target.value)} rows={2} />
            </div>
            <Button onClick={sendTest} disabled={sending} size="sm">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar mensagem de teste
            </Button>
            {sendResult && (
              <div className={`rounded border p-2 text-xs ${
                sendResult.ok
                  ? 'border-[hsl(var(--emerald)/0.30)] bg-[hsl(var(--emerald)/0.10)] text-[hsl(var(--emerald))]'
                  : 'border-[hsl(var(--rose)/0.30)] bg-[hsl(var(--rose)/0.10)] text-[hsl(var(--rose))]'
              }`}>
                {sendResult.ok ? <CheckCircle2 className="h-3.5 w-3.5 inline mr-1" /> : <AlertCircle className="h-3.5 w-3.5 inline mr-1" />}
                {sendResult.text}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
