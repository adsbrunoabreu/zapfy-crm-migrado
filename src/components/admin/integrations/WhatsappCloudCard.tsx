import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSystemIntegrations, useUpsertIntegration } from '@/hooks/useSystemIntegrations';
import { Copy, RefreshCw, Save, MessageSquare, CheckCircle2, XCircle, Loader2, ShieldCheck, ExternalLink, History, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const FIELDS: Array<{ key: string; label: string; help: string; required?: boolean }> = [
  { key: 'messages', label: 'messages', help: 'Mensagens recebidas (obrigatório)', required: true },
  { key: 'message_template_status_update', label: 'message_template_status_update', help: 'Status de templates (HSM)' },
  { key: 'account_update', label: 'account_update', help: 'Atualizações da conta WABA' },
  { key: 'history', label: 'history', help: 'Histórico de 6 meses (Coexistência)' },
  { key: 'smb_app_state_sync', label: 'smb_app_state_sync', help: 'Contatos do app do dono (Coexistência)' },
  { key: 'smb_message_echoes', label: 'smb_message_echoes', help: 'Mensagens enviadas pelo dono (Coexistência)' },
  { key: 'phone_number_quality_update', label: 'phone_number_quality_update', help: 'Qualidade do número (recomendado)' },
];

const generateToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'zapfy_meta_' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
};

const projectRef = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID as string | undefined;
const callbackUrl = projectRef
  ? `https://${projectRef}.supabase.co/functions/v1/webhook-router`
  : 'https://<projeto>.supabase.co/functions/v1/webhook-router';

export const WhatsappCloudCard = () => {
  const { data: cfgs, isLoading } = useSystemIntegrations();
  const upsert = useUpsertIntegration();
  const qc = useQueryClient();
  const [historyOpen, setHistoryOpen] = useState(false);

  type VerifyLog = {
    id: string;
    created_at: string;
    level: string;
    event: string;
    message: string | null;
    metadata: any;
  };
  const { data: verifyLogs = [], isFetching: loadingLogs } = useQuery<VerifyLog[]>({
    queryKey: ['whatsapp-cloud-verify-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_logs')
        .select('id, created_at, level, event, message, metadata')
        .eq('source', 'whatsapp_cloud_verify')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as VerifyLog[];
    },
    staleTime: 30_000,
  });

  const cfg = cfgs?.whatsapp_cloud?.value || {};
  const [verifyToken, setVerifyToken] = useState<string>('');
  const [dirty, setDirty] = useState(false);

  type CheckState = 'idle' | 'running' | 'ok' | 'fail';
  type CheckResult = { state: CheckState; detail?: string };
  const initialChecks = {
    appConfig: { state: 'idle' } as CheckResult,
    handshake: { state: 'idle' } as CheckResult,
    saved: { state: 'idle' } as CheckResult,
  };
  const [checks, setChecks] = useState(initialChecks);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!dirty) setVerifyToken(cfg.verify_token || '');
  }, [cfg.verify_token, dirty]);

  const isSaved = useMemo(
    () => !!cfg.verify_token && cfg.verify_token === verifyToken,
    [cfg.verify_token, verifyToken],
  );

  const verifiedAt: string | undefined = cfg.verified_at;
  const isVerified = !!verifiedAt && isSaved;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  const save = async () => {
    if (!verifyToken || verifyToken.length < 16) {
      toast.error('Token muito curto. Use pelo menos 16 caracteres.');
      return;
    }
    try {
      await upsert.mutateAsync({
        key: 'whatsapp_cloud',
        value: { ...cfg, verify_token: verifyToken },
      });
      setDirty(false);
      toast.success('Verify Token salvo');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    }
  };

  const setCheck = (k: keyof typeof initialChecks, state: CheckState, detail?: string) =>
    setChecks((prev) => ({ ...prev, [k]: { state, detail } }));

  const runVerification = async () => {
    if (!cfg.verify_token) {
      toast.error('Salve o Verify Token antes de verificar.');
      return;
    }
    if (dirty) {
      toast.error('Salve as alterações pendentes antes de verificar.');
      return;
    }
    setVerifying(true);
    setChecks({
      appConfig: { state: 'running' },
      handshake: { state: 'running' },
      saved: { state: 'running' },
    });

    let appOk = false;
    let handshakeOk = false;
    let appDetail = '';
    let handshakeDetail = '';

    // 1) App Meta (App ID + Config ID via edge pública)
    try {
      const { data, error } = await supabase.functions.invoke('cloud-coexistence-config', {});
      if (error) throw error;
      if (!data?.appId || !data?.configId) {
        appDetail = 'META_APP_ID ou META_COEXISTENCE_CONFIG_ID ausentes nos secrets';
        setCheck('appConfig', 'fail', appDetail);
      } else {
        appOk = true;
        appDetail = `App ${data.appId} • Config ${String(data.configId).slice(0, 6)}…`;
        setCheck('appConfig', 'ok', appDetail);
      }
    } catch (e: any) {
      appDetail = e.message || 'Falha ao consultar configuração do app Meta';
      setCheck('appConfig', 'fail', appDetail);
    }

    // 2) Handshake GET (Meta-style) contra o webhook-router
    try {
      const challenge = `lov-${Math.random().toString(36).slice(2, 10)}`;
      const u = new URL(callbackUrl);
      u.searchParams.set('hub.mode', 'subscribe');
      u.searchParams.set('hub.verify_token', cfg.verify_token);
      u.searchParams.set('hub.challenge', challenge);
      const res = await fetch(u.toString(), { method: 'GET' });
      const text = await res.text();
      if (res.status === 200 && text.trim() === challenge) {
        handshakeOk = true;
        handshakeDetail = 'Webhook respondeu o challenge corretamente (200)';
      } else if (res.status === 403) {
        handshakeDetail = 'Token global não confere. Salve o Verify Token novamente.';
      } else {
        handshakeDetail = `HTTP ${res.status}: ${text.slice(0, 80)}`;
      }
      setCheck('handshake', handshakeOk ? 'ok' : 'fail', handshakeDetail);
    } catch (e: any) {
      handshakeDetail = e.message || 'Falha ao chamar Callback URL';
      setCheck('handshake', 'fail', handshakeDetail);
    }

    const overallOk = appOk && handshakeOk;

    // 3a) Persistir verified_at em system_integrations
    try {
      if (overallOk) {
        const verifiedNow = new Date().toISOString();
        await upsert.mutateAsync({
          key: 'whatsapp_cloud',
          value: { ...cfg, verified_at: verifiedNow },
        });
        setCheck('saved', 'ok', `Verificado em ${new Date(verifiedNow).toLocaleString('pt-BR')}`);
        toast.success('Modo Coexistência verificado e liberado');
      } else {
        setCheck('saved', 'fail', 'Corrija os itens acima e tente novamente');
        if (cfg.verified_at) {
          await upsert.mutateAsync({
            key: 'whatsapp_cloud',
            value: { ...cfg, verified_at: null },
          });
        }
        toast.error('Verificação falhou. Veja os itens em vermelho.');
      }
    } catch (e: any) {
      setCheck('saved', 'fail', e.message || 'Falha ao registrar verificação');
    }

    // 3b) Auditoria em system_logs
    try {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from('system_logs').insert({
        source: 'whatsapp_cloud_verify',
        level: overallOk ? 'info' : 'error',
        event: overallOk ? 'verify_passed' : 'verify_failed',
        message: overallOk
          ? 'Modo Coexistência verificado e liberado'
          : 'Falha na verificação do modo Coexistência',
        metadata: {
          checks: {
            appConfig: { ok: appOk, detail: appDetail },
            handshake: { ok: handshakeOk, detail: handshakeDetail },
          },
          callback_url: callbackUrl,
          actor_user_id: u?.user?.id ?? null,
        },
      });
      qc.invalidateQueries({ queryKey: ['whatsapp-cloud-verify-logs'] });
    } catch (e: any) {
      console.warn('[whatsapp_cloud_verify] log insert failed', e?.message);
    }

    setVerifying(false);
  };

  const CheckRow = ({ label, result }: { label: string; result: CheckResult }) => {
    const Icon =
      result.state === 'ok' ? CheckCircle2 :
      result.state === 'fail' ? XCircle :
      result.state === 'running' ? Loader2 : ShieldCheck;
    const tone =
      result.state === 'ok' ? 'text-emerald-500' :
      result.state === 'fail' ? 'text-destructive' :
      result.state === 'running' ? 'text-primary' : 'text-muted-foreground';
    return (
      <div className="flex items-start justify-between gap-3 p-2 text-xs">
        <div className="flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${tone} ${result.state === 'running' ? 'animate-spin' : ''}`} />
          <span className="font-medium">{label}</span>
        </div>
        {result.detail && (
          <span className="text-muted-foreground text-right max-w-[60%] truncate" title={result.detail}>
            {result.detail}
          </span>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              WhatsApp Cloud API (Meta) — Coexistência
            </CardTitle>
            <CardDescription>
              Configure a Callback URL e o Verify Token que devem ser colados no painel do Meta
              for Developers → Webhooks da sua App.
            </CardDescription>
          </div>
          <Badge variant={isVerified ? 'default' : isSaved ? 'secondary' : 'outline'}>
            {isVerified ? 'Verificado' : isSaved ? 'Configurado' : 'Pendente'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Callback URL */}
        <div className="space-y-2">
          <Label>Callback URL</Label>
          <div className="flex gap-2">
            <Input value={callbackUrl} readOnly className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon" onClick={() => copy(callbackUrl, 'Callback URL')}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Cole no Meta App → WhatsApp → Configuration → Callback URL.
          </p>
        </div>

        {/* Verify Token */}
        <div className="space-y-2">
          <Label>Verify Token</Label>
          <div className="flex gap-2">
            <Input
              value={verifyToken}
              onChange={(e) => { setVerifyToken(e.target.value); setDirty(true); }}
              placeholder="Clique em Gerar para criar um token"
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              title="Gerar novo token"
              onClick={() => { setVerifyToken(generateToken()); setDirty(true); }}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={!verifyToken}
              onClick={() => copy(verifyToken, 'Verify Token')}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" onClick={save} disabled={upsert.isPending || !dirty}>
              <Save className="h-4 w-4 mr-1" /> Salvar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            O mesmo token deve ser colado no campo "Verify Token" do Meta. Após salvar, a verificação
            (handshake GET) é validada automaticamente pelo backend.
          </p>
        </div>

        {/* Verificação do modo Coexistência */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Verificação do modo Coexistência
            </Label>
            <Button
              type="button"
              size="sm"
              onClick={runVerification}
              disabled={verifying || !cfg.verify_token || dirty}
            >
              {verifying ? (
                <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Verificando…</>
              ) : (
                <><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Verificar agora</>
              )}
            </Button>
          </div>
          <div className="rounded-md border border-border divide-y divide-border">
            <CheckRow label="Configuração do app Meta (App ID + Config ID)" result={checks.appConfig} />
            <CheckRow label="Handshake do webhook (GET hub.challenge)" result={checks.handshake} />
            <CheckRow label="Liberação registrada (verified_at)" result={checks.saved} />
          </div>
          <p className="text-xs text-muted-foreground">
            Executa um handshake real contra a Callback URL com o Verify Token salvo. Se passar,
            a integração é marcada como <strong>Verificado</strong> e o onboarding via Embedded
            Signup fica liberado para as empresas.
          </p>

          {/* Histórico de verificações */}
          <div className="rounded-md border border-border">
            <button
              type="button"
              onClick={() => setHistoryOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-muted/40 transition-colors"
            >
              <span className="flex items-center gap-2 font-medium">
                {historyOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <History className="h-3.5 w-3.5" />
                Histórico de verificações
                <Badge variant="outline" className="h-4 text-[10px]">{verifyLogs.length}</Badge>
              </span>
              {loadingLogs && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </button>
            {historyOpen && (
              <div className="border-t border-border divide-y divide-border max-h-80 overflow-auto">
                {verifyLogs.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">Nenhuma verificação registrada ainda.</p>
                )}
                {verifyLogs.map((log) => {
                  const ok = log.event === 'verify_passed';
                  const checks = log.metadata?.checks || {};
                  return (
                    <details key={log.id} className="group">
                      <summary className="cursor-pointer list-none px-3 py-2 flex items-center gap-2 text-xs hover:bg-muted/40">
                        {ok
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          : <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                        <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </span>
                        <span className="truncate">{log.message}</span>
                        <Badge
                          variant={ok ? 'default' : 'destructive'}
                          className="ml-auto h-4 text-[10px]"
                        >
                          {ok ? 'sucesso' : 'falha'}
                        </Badge>
                      </summary>
                      <div className="px-3 pb-3 pt-1 space-y-1 text-[11px] text-muted-foreground bg-muted/20">
                        <div className="flex items-start gap-2">
                          {checks.appConfig?.ok
                            ? <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5" />
                            : <XCircle className="h-3 w-3 text-destructive mt-0.5" />}
                          <span><strong>App Meta:</strong> {checks.appConfig?.detail || '—'}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          {checks.handshake?.ok
                            ? <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5" />
                            : <XCircle className="h-3 w-3 text-destructive mt-0.5" />}
                          <span><strong>Handshake:</strong> {checks.handshake?.detail || '—'}</span>
                        </div>
                        {log.metadata?.actor_user_id && (
                          <div className="font-mono opacity-60">
                            Por: {String(log.metadata.actor_user_id).slice(0, 8)}…
                          </div>
                        )}
                      </div>
                    </details>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Webhook fields checklist */}
        <div className="space-y-2">
          <Label>Webhook Fields (assine na WhatsApp Business Account)</Label>
          <div className="rounded-md border border-border divide-y divide-border">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between p-2 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                  <code className="font-mono">{f.label}</code>
                  {f.required && <Badge variant="secondary" className="h-4 text-[10px]">obrigatório</Badge>}
                </div>
                <span className="text-muted-foreground">{f.help}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild variant="outline" size="sm">
            <a href="https://developers.facebook.com/apps/" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Meta for Developers
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a
              href="https://developers.facebook.com/docs/whatsapp/embedded-signup/coexistence"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Docs Coexistência
            </a>
          </Button>
        </div>

        {isLoading && <p className="text-xs text-muted-foreground">Carregando configuração…</p>}
      </CardContent>
    </Card>
  );
};
