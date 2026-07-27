import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Activity, AlertTriangle, CheckCircle2, FlaskConical, Loader2, Play, ScrollText, Timer, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** SLA: tempo máximo aceitável para a notificação aparecer após o disparo */
const TEST_SLA_MS = 3 * 60_000; // 3 minutos
const TEST_TIMEOUT_MS = 5 * 60_000; // desistir após 5min

type AlertRow = {
  key: string;
  label: string;
  description: string;
  /** event prefix in system_logs to find last execution */
  source: string;
  /** edge function name to invoke (optional) */
  fn?: string;
  /** in-app notif type prefix to count */
  notifTypes?: string[];
  /** link for "ver detalhes" */
  link?: string;
  /** cron job_key (para status/heartbeat) */
  cronKey?: string;
  /** se setado, mostra seletor 1/2/5 min */
  cronJobKey?: 'monitor-instance-health' | 'auto-reconnect-instances';
};

const ALERTS: AlertRow[] = [
  {
    key: 'instances',
    label: 'Instâncias offline',
    description: 'E-mail quando uma instância passa do tempo limite offline',
    source: 'monitor_instances',
    fn: 'monitor-instance-health',
    link: '/admin/instance-status',
    cronKey: 'monitor-instance-health',
    cronJobKey: 'monitor-instance-health',
  },
  {
    key: 'reconnect',
    label: 'Reconexão automática',
    description: 'Reconecta instâncias offline com backoff exponencial',
    source: 'auto_reconnect',
    fn: 'auto-reconnect-instances',
    link: '/admin/instance-status',
    cronKey: 'auto-reconnect-instances',
    cronJobKey: 'auto-reconnect-instances',
  },
  {
    key: 'webhook_failures',
    label: 'Falhas persistentes em webhooks',
    description: 'Notifica admins quando um webhook esgota tentativas',
    source: 'webhook_retry',
    notifTypes: ['webhook_retry_dead'],
    link: '/admin/retry-queue',
    cronKey: 'webhook-retry-worker',
  },
  {
    key: 'messaging_health',
    label: 'Saúde de mensageria',
    description: 'Alertas in-app para fila de webhooks/envios travada',
    source: 'messaging_alerts',
    notifTypes: ['messaging_inbox_backlog', 'messaging_outbound_backlog', 'messaging_failed_sends_high'],
    link: '/admin/messaging-health',
    cronKey: 'messaging-alerts-check',
  },
  {
    key: 'ai_usage',
    label: 'Uso do Agente IA (80% / 100%)',
    description: 'E-mail aos admins ao atingir 80% e 100% do limite mensal',
    source: 'ai_usage_alerts',
    fn: 'ai-usage-alerts',
    cronKey: 'ai-usage-alerts',
  },
  {
    key: 'trial_reminders',
    label: 'Lembretes de teste grátis',
    description: 'Notificações 6h antes do fim do trial e quando expira',
    source: 'trial_reminders',
    fn: 'trial-reminders',
    cronKey: 'trial-reminders',
  },
];

/** Heartbeat: tempo desde a última execução acima do qual algo está errado */
const HEARTBEAT_STALE_MULTIPLIER = 3; // ex.: cron 2min → stale após 6min

export const AlertsOverviewCard = () => {
  const [running, setRunning] = useState<string | null>(null);
  const [savingFreq, setSavingFreq] = useState<string | null>(null);

  // Frequência atual dos crons configuráveis
  const freqQuery = useQuery({
    queryKey: ['alert-cron-frequencies'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_alert_cron_frequencies');
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of data || []) if (r.job_key && r.minutes) map.set(r.job_key, r.minutes);
      return map;
    },
  });

  type CronStatus = {
    job_key: string;
    jobname: string;
    schedule: string;
    active: boolean;
    last_run_at: string | null;
    last_run_status: string | null;
    last_run_message: string | null;
    last_run_duration_ms: number | null;
  };
  const cronStatusQuery = useQuery({
    queryKey: ['alert-cron-status'],
    staleTime: 30_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_alert_cron_status');
      if (error) throw error;
      const map = new Map<string, CronStatus>();
      for (const r of (data || []) as CronStatus[]) map.set(r.job_key, r);
      return map;
    },
  });

  type CronMetrics = {
    job_key: string;
    source: string;
    runs: number;
    errors: number;
    last_run_at: string | null;
    last_duration_ms: number;
    avg_duration_ms: number;
    max_duration_ms: number;
    total_processed: number;
    totals: Record<string, number>;
  };
  const [metricsWindow, setMetricsWindow] = useState<number>(1440); // minutos: 60, 360, 1440
  const metricsQuery = useQuery({
    queryKey: ['alert-cron-metrics', metricsWindow],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_alert_cron_metrics', {
        _window_minutes: metricsWindow,
      });
      if (error) throw error;
      const map = new Map<string, CronMetrics>();
      for (const r of (data || []) as CronMetrics[]) map.set(r.job_key, r);
      return map;
    },
  });

  const setFrequency = async (jobKey: string, minutes: number) => {
    setSavingFreq(jobKey);
    try {
      const { error } = await (supabase as any).rpc('set_alert_cron_frequency', {
        _job: jobKey,
        _minutes: minutes,
      });
      if (error) throw error;
      toast.success(`Frequência de ${jobKey} alterada para ${minutes} min`);
      freqQuery.refetch();
    } catch (e: any) {
      toast.error(`Falha ao alterar frequência: ${e?.message || 'erro'}`);
    } finally {
      setSavingFreq(null);
    }
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['alerts-overview'],
    refetchInterval: 30_000,
    staleTime: 15_000,
    queryFn: async () => {
      const sources = ALERTS.map((a) => a.source);
      const notifTypes = ALERTS.flatMap((a) => a.notifTypes || []);

      const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

      const [logs, notifs] = await Promise.all([
        supabase
          .from('system_logs')
          .select('source, event, created_at, level')
          .in('source', sources)
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .limit(500),
        notifTypes.length
          ? supabase
              .from('app_notifications')
              .select('type, created_at')
              .in('type', notifTypes)
              .gte('created_at', since)
              .limit(1000)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const lastBySource = new Map<string, { created_at: string; level: string }>();
      const errorCountBySource = new Map<string, number>();
      for (const l of logs.data || []) {
        if (!lastBySource.has(l.source)) lastBySource.set(l.source, l);
        if (l.level === 'error' || l.level === 'warning') {
          errorCountBySource.set(l.source, (errorCountBySource.get(l.source) || 0) + 1);
        }
      }

      const notifCountByType = new Map<string, number>();
      for (const n of (notifs as any).data || []) {
        notifCountByType.set(n.type, (notifCountByType.get(n.type) || 0) + 1);
      }

      return { lastBySource, errorCountBySource, notifCountByType };
    },
  });

  const runNow = async (a: AlertRow) => {
    if (!a.fn) return;
    setRunning(a.key);
    try {
      const { data, error } = await supabase.functions.invoke(a.fn, { body: {} });
      if (error) {
        let msg = error.message;
        try { msg = (error as any).context?.json?.error || msg; } catch { /* */ }
        throw new Error(msg);
      }
      toast.success(`${a.label}: execução disparada`);
      refetch();
    } catch (e: any) {
      toast.error(`${a.label}: ${e?.message || 'erro'}`);
    } finally {
      setRunning(null);
    }
  };

  // ── Teste end-to-end do pipeline de alertas ──
  type TestState = {
    status: 'idle' | 'running' | 'success' | 'timeout' | 'error';
    startedAt?: number;
    elapsedMs?: number;
    testId?: string;
    retryId?: string;
    notificationAt?: number;
    error?: string;
  };
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const pollRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (tickRef.current) window.clearInterval(tickRef.current);
  }, []);

  const fireTest = async () => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    if (tickRef.current) window.clearInterval(tickRef.current);

    const startedAt = Date.now();
    setTest({ status: 'running', startedAt, elapsedMs: 0 });
    try {
      const { data, error } = await supabase.functions.invoke('test-alert-fire', {
        body: { kind: 'webhook_failure' },
      });
      if (error) {
        let msg = error.message;
        try { msg = (error as any).context?.json?.error || msg; } catch { /* */ }
        throw new Error(msg);
      }
      const retryId: string = data.retry_id;
      const testId: string = data.test_id;
      setTest((t) => ({ ...t, retryId, testId }));

      // Cronômetro visual (1s)
      tickRef.current = window.setInterval(() => {
        setTest((t) => (t.status === 'running'
          ? { ...t, elapsedMs: Date.now() - (t.startedAt || Date.now()) }
          : t));
      }, 1000);

      // Polling da notificação (2s)
      pollRef.current = window.setInterval(async () => {
        const elapsed = Date.now() - startedAt;
        if (elapsed > TEST_TIMEOUT_MS) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          if (tickRef.current) window.clearInterval(tickRef.current);
          setTest({ status: 'timeout', startedAt, elapsedMs: elapsed, retryId, testId });
          toast.error(`Teste expirou: notificação não chegou em ${Math.round(TEST_TIMEOUT_MS / 60000)} min`);
          return;
        }
        const { data: notif } = await supabase
          .from('app_notifications')
          .select('id, created_at, metadata')
          .eq('type', 'webhook_retry_dead')
          .gte('created_at', new Date(startedAt - 5000).toISOString())
          .contains('metadata', { retry_id: retryId })
          .limit(1)
          .maybeSingle();
        if (notif) {
          const notificationAt = new Date(notif.created_at).getTime();
          const total = notificationAt - startedAt;
          if (pollRef.current) window.clearInterval(pollRef.current);
          if (tickRef.current) window.clearInterval(tickRef.current);
          setTest({
            status: 'success',
            startedAt,
            elapsedMs: total,
            retryId,
            testId,
            notificationAt,
          });
          if (total <= TEST_SLA_MS) {
            toast.success(`Notificação recebida em ${(total / 1000).toFixed(1)}s — dentro do SLA`);
          } else {
            toast.warning(`Notificação recebida em ${(total / 1000).toFixed(1)}s — acima do SLA de ${TEST_SLA_MS / 60000}min`);
          }
          refetch();
        }
      }, 2000);
    } catch (e: any) {
      setTest({ status: 'error', error: e?.message || 'erro', startedAt });
      toast.error(`Teste falhou: ${e?.message || 'erro'}`);
    }
  };


  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" /> Visão geral dos alertas
            </CardTitle>
            <CardDescription>
              Status de cada sistema de alerta da plataforma e disparos recentes
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>Janela:</span>
              {[
                { m: 60, label: '1h' },
                { m: 360, label: '6h' },
                { m: 1440, label: '24h' },
              ].map((opt) => (
                <Button
                  key={opt.m}
                  size="sm"
                  variant={metricsWindow === opt.m ? 'default' : 'outline'}
                  className="h-6 px-2 text-[11px]"
                  onClick={() => setMetricsWindow(opt.m)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => { refetch(); metricsQuery.refetch(); cronStatusQuery.refetch(); }} disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atualizar'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {ALERTS.map((a) => {
          const last = data?.lastBySource.get(a.source);
          const errors = data?.errorCountBySource.get(a.source) || 0;
          const notifCount = (a.notifTypes || []).reduce(
            (acc, t) => acc + (data?.notifCountByType.get(t) || 0),
            0,
          );
          const cron = a.cronKey ? cronStatusQuery.data?.get(a.cronKey) : undefined;
          // Intervalo do cron em minutos (estimado a partir do schedule)
          const cronIntervalMin = cron
            ? cron.schedule === '* * * * *'
              ? 1
              : /^\*\/(\d+) \* \* \* \*$/.test(cron.schedule)
                ? parseInt(cron.schedule.match(/^\*\/(\d+)/)![1], 10)
                : cron.schedule === '0 * * * *'
                  ? 60
                  : null
            : null;
          const lastRunMs = cron?.last_run_at ? Date.now() - new Date(cron.last_run_at).getTime() : null;
          const heartbeatStaleMs = cronIntervalMin ? cronIntervalMin * 60_000 * HEARTBEAT_STALE_MULTIPLIER : null;
          const heartbeatStale = lastRunMs != null && heartbeatStaleMs != null && lastRunMs > heartbeatStaleMs;
          const lastRunFailed = cron?.last_run_status && cron.last_run_status !== 'succeeded';

          return (
            <div
              key={a.key}
              className="rounded border border-border bg-muted/20 p-3 flex flex-wrap items-center gap-3"
            >
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{a.label}</span>

                  {/* Cron registrado? */}
                  {a.cronKey && (
                    cron ? (
                      <Badge
                        variant="outline"
                        className={
                          cron.active
                            ? 'text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)] bg-[hsl(var(--emerald)/0.10)]'
                            : 'text-muted-foreground'
                        }
                        title={`Cron: ${cron.jobname} • ${cron.schedule}`}
                      >
                        <Timer className="h-3 w-3 mr-1" />
                        Cron {cron.active ? 'ativo' : 'pausado'}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[hsl(var(--rose))] border-[hsl(var(--rose)/0.30)] bg-[hsl(var(--rose)/0.10)]"
                      >
                        <XCircle className="h-3 w-3 mr-1" /> Cron não registrado
                      </Badge>
                    )
                  )}

                  {/* Heartbeat */}
                  {cron && lastRunMs != null && (
                    heartbeatStale || lastRunFailed ? (
                      <Badge
                        variant="outline"
                        className="text-[hsl(var(--rose))] border-[hsl(var(--rose)/0.30)] bg-[hsl(var(--rose)/0.10)]"
                        title={cron.last_run_message || ''}
                      >
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {lastRunFailed ? 'Última falhou' : 'Heartbeat parado'}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)] bg-[hsl(var(--emerald)/0.10)]"
                        title={`Última: ${cron.last_run_status} em ${cron.last_run_duration_ms ?? '?'}ms`}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Heartbeat ok
                      </Badge>
                    )
                  )}

                  {errors > 0 && (
                    <Badge variant="outline" className="text-[hsl(var(--rose))] border-[hsl(var(--rose)/0.30)] bg-[hsl(var(--rose)/0.10)]">
                      {errors} log{errors > 1 ? 's' : ''} erro 7d
                    </Badge>
                  )}
                  {a.notifTypes && (
                    <Badge variant="outline">
                      {notifCount} notif. 7d
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{a.description}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {cron?.last_run_at
                    ? `Cron rodou ${formatDistanceToNow(new Date(cron.last_run_at), { addSuffix: true, locale: ptBR })} • intervalo ${cronIntervalMin ?? '?'} min`
                    : last
                      ? `Última execução ${formatDistanceToNow(new Date(last.created_at), { addSuffix: true, locale: ptBR })}`
                      : 'Sem execução registrada'}
                  {cron?.last_run_message && lastRunFailed
                    ? ` — ${cron.last_run_message.slice(0, 120)}`
                    : ''}
                </p>
                {a.cronJobKey && (() => {
                  const m = metricsQuery.data?.get(a.cronJobKey!);
                  if (!m) return null;
                  const errorRate = m.runs > 0 ? Math.round((m.errors / m.runs) * 100) : 0;
                  const totals = m.totals || {};
                  const detail = a.cronJobKey === 'monitor-instance-health'
                    ? `${totals.checked || 0} verificadas • ${totals.alerts_sent || 0} alertas • ${totals.recoveries_sent || 0} recuperações`
                    : `${totals.attempted || 0} tentativas • ${totals.succeeded || 0} sucesso • ${totals.given_up || 0} desistidas`;
                  return (
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                      <div className="rounded border border-border/60 bg-background/40 px-2 py-1">
                        <div className="text-muted-foreground">Execuções</div>
                        <div className="font-medium">{m.runs}</div>
                      </div>
                      <div className="rounded border border-border/60 bg-background/40 px-2 py-1">
                        <div className="text-muted-foreground">Erros</div>
                        <div className={`font-medium ${m.errors > 0 ? 'text-[hsl(var(--rose))]' : ''}`}>
                          {m.errors} {m.runs > 0 && `(${errorRate}%)`}
                        </div>
                      </div>
                      <div className="rounded border border-border/60 bg-background/40 px-2 py-1" title={`máx ${m.max_duration_ms}ms`}>
                        <div className="text-muted-foreground">Duração média</div>
                        <div className="font-medium">{m.avg_duration_ms}ms</div>
                      </div>
                      <div className="rounded border border-border/60 bg-background/40 px-2 py-1">
                        <div className="text-muted-foreground">Última duração</div>
                        <div className="font-medium">{m.last_duration_ms}ms</div>
                      </div>
                      <div className="rounded border border-border/60 bg-background/40 px-2 py-1 col-span-2 sm:col-span-1">
                        <div className="text-muted-foreground">Tarefas processadas</div>
                        <div className="font-medium">{m.total_processed}</div>
                      </div>
                      <div className="col-span-2 sm:col-span-5 text-[11px] text-muted-foreground">
                        {detail}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2">
                {a.cronJobKey && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span>Frequência</span>
                    {[1, 2, 5].map((m) => {
                      const current = freqQuery.data?.get(a.cronJobKey!);
                      const active = current === m;
                      return (
                        <Button
                          key={m}
                          size="sm"
                          variant={active ? 'default' : 'outline'}
                          className="h-6 px-2 text-[11px]"
                          disabled={savingFreq === a.cronJobKey || active}
                          onClick={() => setFrequency(a.cronJobKey!, m)}
                        >
                          {savingFreq === a.cronJobKey && active ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            `${m}m`
                          )}
                        </Button>
                      );
                    })}
                  </div>
                )}
                {a.link && (
                  <Button asChild size="sm" variant="ghost">
                    <Link to={a.link}>
                      <ScrollText className="h-4 w-4 mr-1.5" /> Detalhes
                    </Link>
                  </Button>
                )}
                {a.fn && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => runNow(a)}
                    disabled={running === a.key}
                  >
                    {running === a.key ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-1.5" />
                    )}
                    Executar
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* Bloco de teste end-to-end */}
        <div className="mt-4 rounded border border-dashed border-border bg-muted/10 p-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Testar pipeline de alertas</span>
                {test.status === 'success' && (
                  <Badge
                    variant="outline"
                    className={
                      (test.elapsedMs ?? 0) <= TEST_SLA_MS
                        ? 'text-[hsl(var(--emerald))] border-[hsl(var(--emerald)/0.30)] bg-[hsl(var(--emerald)/0.10)]'
                        : 'text-[hsl(var(--amber))] border-[hsl(var(--amber)/0.30)] bg-[hsl(var(--amber)/0.10)]'
                    }
                  >
                    {(test.elapsedMs ?? 0) <= TEST_SLA_MS ? (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                    )}
                    {((test.elapsedMs ?? 0) / 1000).toFixed(1)}s
                  </Badge>
                )}
                {test.status === 'timeout' && (
                  <Badge
                    variant="outline"
                    className="text-[hsl(var(--rose))] border-[hsl(var(--rose)/0.30)] bg-[hsl(var(--rose)/0.10)]"
                  >
                    <XCircle className="h-3 w-3 mr-1" /> Sem resposta
                  </Badge>
                )}
                {test.status === 'running' && (
                  <Badge variant="outline">
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    {((test.elapsedMs ?? 0) / 1000).toFixed(0)}s
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Enfileira uma falha sintética de webhook. O worker tem que processá-la,
                marcar como "dead" e gerar a notificação <code>webhook_retry_dead</code>{' '}
                em até <strong>{TEST_SLA_MS / 60000} min</strong>. Valida cron + worker + notificação.
              </p>
              {test.status === 'success' && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  Notificação recebida em {((test.elapsedMs ?? 0) / 1000).toFixed(1)}s
                  {(test.elapsedMs ?? 0) <= TEST_SLA_MS
                    ? ` (dentro do SLA de ${TEST_SLA_MS / 60000}min)`
                    : ` (ACIMA do SLA de ${TEST_SLA_MS / 60000}min)`}
                </p>
              )}
              {test.status === 'timeout' && (
                <p className="text-[11px] text-[hsl(var(--rose))] mt-1">
                  Nenhuma notificação chegou em {Math.round(TEST_TIMEOUT_MS / 60000)} min.
                  Verifique se o cron <code>webhook-retry-worker</code> está ativo.
                </p>
              )}
              {test.status === 'error' && (
                <p className="text-[11px] text-[hsl(var(--rose))] mt-1">Erro: {test.error}</p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={fireTest}
              disabled={test.status === 'running'}
            >
              {test.status === 'running' ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <FlaskConical className="h-4 w-4 mr-1.5" />
              )}
              {test.status === 'running' ? 'Testando…' : 'Disparar teste'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
