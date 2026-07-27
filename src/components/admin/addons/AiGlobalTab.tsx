import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Brain, CheckCircle2, XCircle, Loader2, ShieldAlert, History,
  Sparkles, Zap, Globe, Bot, KeyRound, Activity, Clock, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

type Provider = 'lovable' | 'anthropic' | 'openai' | 'google';

const PROVIDERS: {
  value: Provider; label: string; vendor: string; secret: string;
  helper: string; icon: typeof Brain; accent: string;
}[] = [
  { value: 'anthropic', label: 'Claude', vendor: 'Anthropic', secret: 'ANTHROPIC_API_KEY',
    helper: 'claude-sonnet-4-5-20250929', icon: Sparkles, accent: 'from-orange-500/20 to-amber-500/5' },
  { value: 'openai', label: 'GPT', vendor: 'OpenAI', secret: 'OPENAI_API_KEY',
    helper: 'gpt-5, gpt-5-mini, gpt-5-nano', icon: Bot, accent: 'from-emerald-500/20 to-teal-500/5' },
  { value: 'google', label: 'Gemini', vendor: 'Google AI', secret: 'GOOGLE_AI_API_KEY',
    helper: 'gemini-2.5-flash, gemini-2.5-pro', icon: Zap, accent: 'from-sky-500/20 to-blue-500/5' },
  { value: 'lovable', label: 'Lovable Gateway', vendor: 'Lovable AI', secret: 'LOVABLE_API_KEY',
    helper: 'google/gemini-3-flash-preview', icon: Globe, accent: 'from-violet-500/20 to-fuchsia-500/5' },
];

function freshness(testedAt?: string | null) {
  if (!testedAt) return { label: 'nunca testado', dot: 'bg-destructive' };
  const ageHrs = (Date.now() - new Date(testedAt).getTime()) / 36e5;
  if (ageHrs < 1) return { label: 'agora há pouco', dot: 'bg-emerald-500' };
  if (ageHrs < 24) return { label: `há ${Math.round(ageHrs)}h`, dot: 'bg-amber-500' };
  return { label: `há ${Math.round(ageHrs / 24)}d`, dot: 'bg-destructive' };
}

export function AiGlobalTab() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ provider: Provider; model: string } | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [models, setModels] = useState<Record<Provider, string>>({
    anthropic: '', openai: '', google: '', lovable: '',
  });
  const [testingSet, setTestingSet] = useState<Set<Provider>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['ai-global-config'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-global-config', { body: { action: 'get' } });
      if (error) throw error;
      return data as {
        config: any;
        keysConfigured: Record<Provider, boolean>;
        defaults: Record<Provider, string>;
      };
    },
    refetchOnWindowFocus: true,
  });

  const { data: history } = useQuery({
    queryKey: ['ai-global-history'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('ai-global-config', { body: { action: 'history' } });
      if (error) throw error;
      return (data as { history: any[] }).history;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    const channel = supabase
      .channel('ai-global-config-rt')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ai_global_config' },
        () => {
          qc.invalidateQueries({ queryKey: ['ai-global-config'] });
          qc.invalidateQueries({ queryKey: ['ai-global-history'] });
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!data?.config) return;
    setModels({
      anthropic: data.config.anthropic_model || data.defaults.anthropic,
      openai: data.config.openai_model || data.defaults.openai,
      google: data.config.google_model || data.defaults.google,
      lovable: data.config.active_provider === 'lovable' ? data.config.active_model : data.defaults.lovable,
    });
  }, [data]);

  const refreshNow = async () => {
    await qc.refetchQueries({ queryKey: ['ai-global-config'] });
  };

  const save = useMutation({
    mutationFn: async (vars: { provider: Provider; model: string }) => {
      const { data, error } = await supabase.functions.invoke('ai-global-config', {
        body: { action: 'save', provider: vars.provider, model: vars.model },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: async () => {
      toast.success('Modelo global atualizado para TODOS os clientes');
      await Promise.all([
        qc.refetchQueries({ queryKey: ['ai-global-config'] }),
        qc.refetchQueries({ queryKey: ['ai-global-history'] }),
      ]);
      setPending(null);
      setConfirmText('');
    },
    onError: (e: any) => toast.error(e.message || 'Falha ao salvar'),
  });

  const toggleTesting = (p: Provider, on: boolean) => {
    setTestingSet((prev) => {
      const next = new Set(prev);
      if (on) next.add(p); else next.delete(p);
      return next;
    });
  };

  const handleTest = async (provider: Provider) => {
    toggleTesting(provider, true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-global-config', {
        body: { action: 'test', provider, model: models[provider] },
      });
      if (error) throw error;
      const r = data as { ok: boolean; error?: string };
      if (r.ok) toast.success(`${provider} conectado`);
      else toast.error(`${provider}: ${r.error}`);
      await refreshNow();
    } catch (e: any) {
      toast.error(e.message || 'Falha no teste');
    } finally {
      toggleTesting(provider, false);
    }
  };

  const handleTestAll = async () => {
    PROVIDERS.forEach((p) => toggleTesting(p.value, true));
    try {
      const { data, error } = await supabase.functions.invoke('ai-global-config', { body: { action: 'test_all' } });
      if (error) throw error;
      const results = (data as any).results as Record<Provider, { ok: boolean; error?: string }>;
      const okCount = Object.values(results).filter((r) => r.ok).length;
      toast.success(`Testes concluídos: ${okCount}/4 OK`);
      await refreshNow();
    } catch (e: any) {
      toast.error(e.message || 'Falha nos testes');
    } finally {
      setTestingSet(new Set());
    }
  };

  const cfg = data?.config;
  const activeProvider: Provider = cfg?.active_provider || 'lovable';
  const activeOk = cfg?.[`${activeProvider}_test_ok`];
  const activeFailures = cfg?.consecutive_failures ?? 0;
  const activeMeta = PROVIDERS.find((p) => p.value === activeProvider)!;

  const pendingOk = useMemo(() => {
    if (!pending) return false;
    const okFlag = cfg?.[`${pending.provider}_test_ok`];
    const testedAt = cfg?.[`${pending.provider}_tested_at`];
    if (!okFlag || !testedAt) return false;
    const ageHrs = (Date.now() - new Date(testedAt).getTime()) / 36e5;
    return ageHrs < 24;
  }, [pending, cfg]);

  const canConfirm = pendingOk && confirmText.trim().toUpperCase() === 'TROCAR';

  const okCount = PROVIDERS.filter((p) => cfg?.[`${p.value}_test_ok`]).length;
  const keysCount = PROVIDERS.filter((p) => data?.keysConfigured?.[p.value]).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Brain className="h-4 w-4" /> Provedor Global de IA
          </h2>
          <p className="text-xs text-muted-foreground">Modelo usado por todas as edge functions e clientes.</p>
        </div>
        <Button size="sm" onClick={handleTestAll} disabled={testingSet.size > 0}>
          {testingSet.size > 0
            ? (<><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Testando…</>)
            : (<><Activity className="h-3 w-3 mr-2" /> Testar todos</>)}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Provider ativo" value={activeMeta.label} sub={activeMeta.vendor} icon={activeMeta.icon} />
        <StatTile label="Modelo" value={cfg?.active_model || '—'} sub="em produção" icon={Sparkles} mono />
        <StatTile label="Chaves OK" value={`${keysCount}/4`} sub="secrets configurados" icon={KeyRound} />
        <StatTile label="Testes OK" value={`${okCount}/4`} sub="status atual" icon={CheckCircle2} />
      </div>

      {!isLoading && (activeOk === false || activeFailures >= 1) && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 mt-0.5 text-destructive shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-destructive">
              Provedor ativo com falha — IA pode estar indisponível para todos os clientes
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {activeProvider}/{cfg?.active_model} • {cfg?.[`${activeProvider}_test_error`] || 'sem detalhes'}
              {activeFailures > 0 && ` • ${activeFailures} falha(s) consecutiva(s)`}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleTest(activeProvider)}
            disabled={testingSet.has(activeProvider)}>
            Testar agora
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROVIDERS.map((p) => {
            const isActive = activeProvider === p.value;
            const keyOk = data?.keysConfigured?.[p.value];
            const testedAt = cfg?.[`${p.value}_tested_at`];
            const testOk = cfg?.[`${p.value}_test_ok`];
            const testErr = cfg?.[`${p.value}_test_error`];
            const f = freshness(testedAt);
            const isTesting = testingSet.has(p.value);
            const Icon = p.icon;

            return (
              <Card key={p.value}
                className={cn('relative overflow-hidden transition-all',
                  isActive ? 'ring-2 ring-primary border-primary/50' : 'hover:border-foreground/20')}>
                <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none opacity-60', p.accent)} />
                <CardContent className="relative p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-background/80 ring-1 ring-border flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{p.label}</h3>
                          {isActive && (
                            <Badge className="gap-1 text-[10px] h-5">
                              <CheckCircle2 className="h-3 w-3" /> ATIVO
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{p.vendor}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={keyOk ? 'secondary' : 'destructive'} className="text-[10px]">
                        {keyOk ? 'chave OK' : 'sem chave'}
                      </Badge>
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className={cn('h-1.5 w-1.5 rounded-full', f.dot)} />
                        {f.label}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Modelo</Label>
                    <Input
                      value={models[p.value]}
                      onChange={(e) => setModels((m) => ({ ...m, [p.value]: e.target.value }))}
                      placeholder={p.helper}
                      className="font-mono text-sm bg-background/60"
                    />
                    <p className="text-[10px] text-muted-foreground">Sugestão: {p.helper}</p>
                  </div>

                  <div className="rounded-lg border border-border bg-background/50 p-3 text-xs">
                    {isTesting ? (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Testando conexão…
                      </div>
                    ) : testedAt ? (
                      <div className="flex items-start gap-2">
                        {testOk ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={cn('font-medium', testOk ? 'text-emerald-500' : 'text-destructive')}>
                            {testOk ? 'Conexão saudável' : testErr}
                          </p>
                          <p className="text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="h-3 w-3" />
                            {new Date(testedAt).toLocaleString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">Nenhum teste registrado ainda.</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1"
                      disabled={!keyOk || isTesting} onClick={() => handleTest(p.value)}>
                      {isTesting ? (<><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Testando…</>) : 'Testar conexão'}
                    </Button>
                    {!isActive && (
                      <Button size="sm" className="flex-1" disabled={!keyOk}
                        onClick={() => { setConfirmText(''); setPending({ provider: p.value, model: models[p.value] }); }}>
                        Ativar <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>

                  {!keyOk && (
                    <p className="text-[10px] text-muted-foreground">
                      Configure o secret <code className="px-1 py-0.5 bg-muted rounded font-mono">{p.secret}</code>.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <History className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Histórico de trocas</h3>
            <Badge variant="outline" className="text-[10px]">últimas {history?.length ?? 0}</Badge>
          </div>
          <Separator className="mb-3" />
          {!history?.length ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Nenhuma troca registrada ainda.</p>
          ) : (
            <ol className="relative border-l border-border ml-2 space-y-3 pl-4">
              {history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                  <p className="text-sm">{h.message}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(h.created_at).toLocaleString('pt-BR')}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setConfirmText(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-warning" />
              Confirmar troca de modelo global
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Isso vai mudar o modelo de IA para <strong>TODOS os clientes</strong> da plataforma, imediatamente.
                </p>
                <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">De</span><span className="font-mono">{cfg?.active_provider}/{cfg?.active_model}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Para</span><span className="font-mono text-foreground">{pending?.provider}/{pending?.model}</span></div>
                </div>
                {!pendingOk && (
                  <div className="text-xs p-2 rounded bg-destructive/10 text-destructive border border-destructive/40">
                    Teste a conexão com sucesso (nas últimas 24h) antes de ativar este provedor.
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Para confirmar, digite <code className="px-1 bg-muted rounded font-mono">TROCAR</code></Label>
                  <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="TROCAR" autoFocus />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); pending && save.mutate(pending); }}
              disabled={save.isPending || !canConfirm}
            >
              {save.isPending ? 'Salvando…' : 'Confirmar troca'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatTile({ label, value, sub, icon: Icon, mono }: {
  label: string; value: string; sub: string; icon: typeof Brain; mono?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/60 backdrop-blur p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className={cn('mt-1 font-semibold truncate', mono && 'font-mono text-sm')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{sub}</p>
    </div>
  );
}
