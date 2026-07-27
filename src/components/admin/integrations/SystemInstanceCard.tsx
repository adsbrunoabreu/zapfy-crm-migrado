import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useSystemIntegrations, useUpsertIntegration } from '@/hooks/useSystemIntegrations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  MessageCircle, QrCode, Trash2, RefreshCw, CheckCircle2, AlertCircle, Loader2,
  Copy, Send, Phone, Smartphone, Download, ImageOff,
} from 'lucide-react';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const extractQr = (raw: any): string | null => {
  if (!raw) return null;
  const candidates = [
    raw?.qrcode?.base64, raw?.base64, raw?.qrcode?.code, raw?.code,
    raw?.instance?.qrcode?.base64, raw?.instance?.qrcode,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 20) return c;
  }
  return null;
};

const toDataUrl = (qr: string) =>
  qr.startsWith('data:') ? qr : `data:image/png;base64,${qr.replace(/^data:image\/png;base64,/, '')}`;

const extractPhone = (raw: any): string | null => {
  const wuid = raw?.instance?.wuid || raw?.wuid || raw?.instance?.owner;
  if (typeof wuid === 'string') return wuid.split('@')[0];
  return null;
};

const extractProfileName = (raw: any): string | null =>
  raw?.instance?.profileName || raw?.profileName || null;

export const SystemInstanceCard = () => {
  const { data: cfgs } = useSystemIntegrations();
  const upsert = useUpsertIntegration();
  const cfg = cfgs?.evolution_internal?.value || {};

  const [instanceName, setInstanceName] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>(cfg.status || 'disconnected');
  const [phone, setPhone] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [heartbeats, setHeartbeats] = useState<{ ts: number; ms: number; ok: boolean; state: string }[]>([]);
  const [, setTick] = useState(0);

  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('Teste da instância interna do sistema ✅');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);

  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    setInstanceName(cfg.instance_name || '');
    setStatus(cfg.status || 'disconnected');
  }, [cfg.instance_name, cfg.status]);

  const callMaster = async (action: string, body: any = {}) => {
    const { data, error } = await supabase.functions.invoke('master-evolution-instance', {
      body: { action, instance_name: instanceName, ...body },
    });
    if (error) {
      let msg = error.message;
      try {
        const ctx: any = (error as any).context;
        if (ctx?.json) msg = ctx.json.error || msg;
      } catch { /* ignore */ }
      throw new Error(msg);
    }
    return data;
  };

  const prevStatusRef = useRef<string | null>(null);

  const isConnectedState = (s: string) => s === 'open' || s === 'connected';

  const refreshStatus = async () => {
    if (!instanceName) return;
    const t0 = Date.now();
    try {
      const result = await callMaster('status');
      const ms = Date.now() - t0;
      const raw = result?.data;
      const s = raw?.instance?.state || raw?.state || 'disconnected';

      // Detecta transição: conectado -> desconectado
      const prev = prevStatusRef.current;
      if (prev && isConnectedState(prev) && !isConnectedState(s)) {
        toast.error(`⚠️ Instância "${instanceName}" foi desconectada`, {
          description: 'Reconecte via QR Code para retomar o envio de notificações.',
          duration: 10000,
        });
        console.warn(`[alert:sistema] desconectada (${prev} → ${s})`);
      }
      prevStatusRef.current = s;

      setStatus(s);
      setPhone(extractPhone(raw));
      setProfileName(extractProfileName(raw));
      setLastChecked(new Date());
      setLatency(ms);
      setHeartbeats((h) => [...h, { ts: Date.now(), ms, ok: true, state: s }].slice(-12));
      console.log(`[heartbeat:sistema] ✓ ${ms}ms · state=${s}`);
      await upsert.mutateAsync({
        key: 'evolution_internal',
        value: { ...cfg, instance_name: instanceName, status: s },
      });
    } catch (e: any) {
      const ms = Date.now() - t0;
      setHeartbeats((h) => [...h, { ts: Date.now(), ms, ok: false, state: 'error' }].slice(-12));
      console.warn(`[heartbeat:sistema] ✗ ${ms}ms · ${e?.message}`);
    }
  };

  // Auto-refresh a cada 10s quando dialog não está aberto
  useEffect(() => {
    if (!instanceName || qrOpen) return;
    refreshStatus();
    const id = window.setInterval(refreshStatus, 10000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceName, qrOpen]);

  // Tick de 1s para atualizar contador "há Xs"
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const tryGetQr = async (): Promise<string | null> => {
    for (let i = 0; i < 4; i++) {
      const res = await callMaster('connect');
      const qrCode = extractQr(res?.data);
      if (qrCode) return qrCode;
      await sleep(1500);
    }
    return null;
  };

  const createOrConnect = async () => {
    if (!instanceName) return toast.error('Informe o nome da instância');
    setLoading(true);
    setQr(null);
    try {
      let qrCode: string | null = null;
      const createRes = await callMaster('create');
      if (createRes?.success) {
        qrCode = extractQr(createRes.data);
      } else {
        const isExists =
          createRes?.status === 403 || createRes?.status === 409 ||
          /exist|already|in use/i.test(JSON.stringify(createRes?.data || createRes?.error || ''));
        if (!isExists) {
          throw new Error(createRes?.error || createRes?.data?.message || `Falha ao criar (HTTP ${createRes?.status})`);
        }
      }

      if (!qrCode) qrCode = await tryGetQr();

      if (qrCode) {
        setQr(toDataUrl(qrCode));
        setQrOpen(true);
        await upsert.mutateAsync({
          key: 'evolution_internal',
          value: { ...cfg, instance_name: instanceName, status: 'connecting' },
        });
        startPolling();
      } else {
        await refreshStatus();
        if (status === 'open' || status === 'connected') {
          toast.success('Instância já conectada');
        } else {
          toast.error('Não foi possível obter o QR Code. Tente novamente.');
        }
      }
    } catch (e: any) {
      console.error('createOrConnect error', e);
      toast.error(e?.message || 'Erro ao conectar');
    } finally {
      setLoading(false);
    }
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    let attempts = 0;
    pollRef.current = window.setInterval(async () => {
      attempts++;
      try {
        const result = await callMaster('status');
        const raw = result?.data;
        const s = raw?.instance?.state || raw?.state || 'disconnected';
        setStatus(s);
        setPhone(extractPhone(raw));
        setProfileName(extractProfileName(raw));
        if (s === 'open' || s === 'connected') {
          if (pollRef.current) clearInterval(pollRef.current);
          setQrOpen(false);
          toast.success('Instância conectada!');
          await upsert.mutateAsync({
            key: 'evolution_internal',
            value: { ...cfg, instance_name: instanceName, status: s },
          });
        }
      } catch { /* ignore */ }
      if (attempts > 60 && pollRef.current) clearInterval(pollRef.current);
    }, 3000);
  };

  const remove = async () => {
    if (!confirm('Remover instância?')) return;
    try {
      await callMaster('delete');
      await upsert.mutateAsync({
        key: 'evolution_internal',
        value: { instance_name: '', status: 'disconnected' },
      });
      setInstanceName('');
      setStatus('disconnected');
      setPhone(null);
      setProfileName(null);
      toast.success('Instância removida');
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    }
  };

  const sendTest = async () => {
    if (!testPhone || !testMsg) return toast.error('Preencha telefone e mensagem');
    setSending(true);
    setSendResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-system-whatsapp', {
        body: { phone: testPhone.replace(/\D/g, ''), body: testMsg },
      });
      if (error) {
        let msg = error.message;
        try { msg = (error as any).context?.json?.error || msg; } catch { /* */ }
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || 'Falha');
      setSendResult({ ok: true, text: 'Mensagem enviada com sucesso!' });
      toast.success('Enviado');
    } catch (e: any) {
      setSendResult({ ok: false, text: e?.message || 'Erro' });
      toast.error(e?.message || 'Erro');
    } finally {
      setSending(false);
    }
  };

  const copyName = () => {
    navigator.clipboard.writeText(instanceName);
    toast.success('Nome copiado');
  };

  const copyQr = async () => {
    if (!qr) return;
    try {
      // Tenta copiar como imagem (Clipboard API com PNG)
      if (navigator.clipboard && (window as any).ClipboardItem) {
        const blob = await (await fetch(qr)).blob();
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({ [blob.type]: blob }),
        ]);
        toast.success('QR Code copiado como imagem');
        return;
      }
      // Fallback: copia o data URL como texto
      await navigator.clipboard.writeText(qr);
      toast.success('QR Code copiado (texto base64)');
    } catch (e: any) {
      // Último fallback
      try {
        await navigator.clipboard.writeText(qr);
        toast.success('QR Code copiado (texto base64)');
      } catch {
        toast.error('Não foi possível copiar');
      }
    }
  };

  const downloadQr = () => {
    if (!qr) return;
    const a = document.createElement('a');
    a.href = qr;
    a.download = `qrcode-${instanceName || 'whatsapp'}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('Download iniciado');
  };

  const retryQr = async () => {
    setLoading(true);
    setQr(null);
    try {
      const code = await tryGetQr();
      if (code) {
        setQr(toDataUrl(code));
      } else {
        toast.error('QR ainda indisponível. Tente novamente em instantes.');
      }
    } catch (e: any) {
      toast.error(e?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  };


  const isConnected = status === 'open' || status === 'connected';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" /> Evolution API Internal do sistema
            </CardTitle>
            <CardDescription>
              Instância Evolution usada para enviar notificações da plataforma via WhatsApp
            </CardDescription>
            {instanceName && (
              <div className="flex items-center gap-2 pt-1">
                <Badge variant="outline" className="font-mono text-xs gap-1.5">
                  <Smartphone className="h-3 w-3" /> {instanceName}
                </Badge>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyName}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <Badge
            variant="outline"
            className={
              isConnected
                ? 'text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)] bg-[hsl(var(--emerald)/0.10)]'
                : status === 'connecting'
                ? 'text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.30)] bg-[hsl(var(--amber)/0.10)]'
                : 'text-muted-foreground border-border bg-muted'
            }
          >
            {isConnected ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
            {isConnected ? 'Conectado' : status === 'connecting' ? 'Conectando' : 'Desconectado'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Banner de aviso quando desconectada */}
        {instanceName && !isConnected && status !== 'connecting' && (
          <div className="rounded border border-[hsl(var(--rose)/0.40)] bg-[hsl(var(--rose)/0.10)] p-3 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-[hsl(var(--rose))] flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-[hsl(var(--rose))]">Instância desconectada</p>
              <p className="text-xs text-muted-foreground">
                As notificações via WhatsApp do sistema estão pausadas. Reconecte escaneando o QR Code.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 border-[hsl(var(--rose)/0.40)] text-[hsl(var(--rose))] hover:bg-[hsl(var(--rose)/0.10)]"
                onClick={createOrConnect}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <QrCode className="h-3.5 w-3.5 mr-2" />}
                Reconectar agora
              </Button>
            </div>
          </div>
        )}

        {/* Heartbeat live */}
        {instanceName && (
          <div className="rounded border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Heartbeat ao vivo
              </Label>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {lastChecked
                  ? `há ${Math.max(0, Math.floor((Date.now() - lastChecked.getTime()) / 1000))}s · próximo em ${Math.max(0, 10 - Math.floor((Date.now() - lastChecked.getTime()) / 1000))}s`
                  : 'aguardando…'}
                {latency != null && ` · ${latency}ms`}
              </span>
            </div>
            <div className="flex items-end gap-1 h-10">
              {heartbeats.length === 0 ? (
                <p className="text-[10px] text-muted-foreground self-center">Aguardando primeira leitura…</p>
              ) : (
                heartbeats.map((h, idx) => {
                  const max = Math.max(...heartbeats.map((x) => x.ms), 100);
                  const pct = Math.max(8, (h.ms / max) * 100);
                  const color = !h.ok
                    ? 'bg-[hsl(var(--rose)/0.7)]'
                    : h.state === 'open' || h.state === 'connected'
                    ? 'bg-[hsl(var(--emerald))]/70'
                    : h.state === 'connecting'
                    ? 'bg-[hsl(var(--amber))]/70'
                    : 'bg-muted-foreground/40';
                  return (
                    <div
                      key={idx}
                      className={`flex-1 rounded-t ${color}`}
                      style={{ height: `${pct}%` }}
                      title={`${new Date(h.ts).toLocaleTimeString('pt-BR')} · ${h.ms}ms · ${h.state}`}
                    />
                  );
                })
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{heartbeats.length}/12 amostras · auto 10s</span>
              {heartbeats.length > 0 && (
                <span className="tabular-nums">
                  média {Math.round(heartbeats.reduce((s, h) => s + h.ms, 0) / heartbeats.length)}ms
                </span>
              )}
            </div>
          </div>
        )}

        {/* Detalhes da conexão */}
        {isConnected && (phone || profileName) && (
          <div className="rounded border border-[hsl(var(--emerald)/0.30)] bg-[hsl(var(--emerald))]/5 p-3 space-y-1 text-xs">
            {profileName && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--emerald))]" />
                <span className="text-muted-foreground">Conta:</span>
                <span className="font-medium">{profileName}</span>
              </div>
            )}
            {phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-[hsl(var(--emerald))]" />
                <span className="text-muted-foreground">Número:</span>
                <span className="font-mono">+{phone}</span>
              </div>
            )}
            {lastChecked && (
              <p className="text-[10px] text-muted-foreground pt-1">
                Verificado às {lastChecked.toLocaleTimeString('pt-BR')}
              </p>
            )}
          </div>
        )}

        <div>
          <Label>Nome da instância</Label>
          <Input
            value={instanceName}
            onChange={(e) => setInstanceName(e.target.value.replace(/\s+/g, '-').toLowerCase())}
            placeholder="sistema-notifications"
            disabled={isConnected}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={createOrConnect} disabled={loading || !instanceName}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <QrCode className="h-4 w-4 mr-2" />}
            {loading ? 'Carregando...' : isConnected ? 'Reconectar' : 'Conectar via QR Code'}
          </Button>
          <Button variant="outline" onClick={refreshStatus} disabled={!instanceName}>
            <RefreshCw className="h-4 w-4 mr-2" /> Atualizar status
          </Button>
          {instanceName && (
            <Button variant="destructive" onClick={remove}>
              <Trash2 className="h-4 w-4 mr-2" /> Remover
            </Button>
          )}
        </div>

        {/* Box de teste */}
        {isConnected && (
          <div className="rounded border border-border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              <h4 className="text-sm font-medium">Teste de envio</h4>
            </div>
            <div>
              <Label className="text-xs">Telefone destinatário (com DDI)</Label>
              <Input
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="5511999999999"
              />
            </div>
            <div>
              <Label className="text-xs">Mensagem</Label>
              <Textarea value={testMsg} onChange={(e) => setTestMsg(e.target.value)} rows={2} />
            </div>
            <Button onClick={sendTest} disabled={sending} size="sm">
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar teste
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

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Escaneie o QR Code</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular &gt; Configurações &gt; Aparelhos conectados &gt; Conectar um aparelho.
            </DialogDescription>
          </DialogHeader>

          {qr ? (
            <>
              <div className="flex justify-center p-4 bg-white rounded">
                <img src={qr} alt="QR Code para conectar WhatsApp" className="max-w-full" />
              </div>
              <div className="flex justify-center gap-2">
                <Button variant="outline" size="sm" onClick={copyQr}>
                  <Copy className="h-4 w-4 mr-2" /> Copiar imagem
                </Button>
                <Button variant="outline" size="sm" onClick={downloadQr}>
                  <Download className="h-4 w-4 mr-2" /> Baixar PNG
                </Button>
              </div>
            </>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center p-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Gerando QR Code…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-muted/40 border border-border flex items-center justify-center">
                <ImageOff className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">QR Code indisponível</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  A instância pode já estar conectada, ou o servidor ainda está gerando o código.
                  Tente novamente em alguns segundos.
                </p>
              </div>
              <Button size="sm" onClick={retryQr}>
                <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground">
            Status: {isConnected ? 'Conectado' : status === 'connecting' ? 'Conectando' : 'Desconectado'}
          </p>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
