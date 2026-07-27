import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { Activity, AlertTriangle, RefreshCw, Clock, TrendingDown, ListChecks, Zap } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ProviderGatePanel } from '@/components/admin/ProviderGatePanel';
import { StoreWorkerConfigPanel } from '@/components/admin/StoreWorkerConfigPanel';

interface Metrics {
  window_minutes: number;
  generated_at: string;
  status: { pending: number; running: number; success: number; failed: number; cancelled: number; total: number };
  backlog_ready: number;
  retried: number;
  failure_rate: number;
  retry_rate: number;
  latency: { avg_sec: number | null; p95_sec: number | null; max_sec: number | null };
  per_type: Array<{ job_type: string; total: number; success: number; failed: number; avg_attempts: number }>;
  per_company: Array<{
    company_id: string; company_name: string | null;
    total: number; success: number; failed: number; pending: number;
    retried: number; avg_latency_sec: number | null; last_error: string | null;
  }>;
  recent_errors: Array<{ id: string; company_id: string; job_type: string; attempts: number; last_error: string; finished_at: string }>;
  worker: { last_finished: string | null; last_started: string | null };
}

const Stat = ({ label, value, icon: Icon, tone = 'default', sub }: {
  label: string; value: string | number; icon: React.ElementType; tone?: 'default' | 'good' | 'warn' | 'bad'; sub?: string;
}) => (
  <Card className="p-4">
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Icon className={`w-4 h-4 ${
        tone === 'good' ? 'text-emerald-500' :
        tone === 'warn' ? 'text-yellow-500' :
        tone === 'bad'  ? 'text-destructive' : 'text-muted-foreground'
      }`} />
    </div>
    <div className="text-2xl font-semibold mt-1">{value}</div>
    {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
  </Card>
);

export default function JobsMetrics() {
  const { isMaster } = useAuth();
  const [windowMin, setWindowMin] = useState(60);

  const { data: metrics, refetch, isFetching } = useQuery({
    queryKey: ['jobs-metrics', windowMin],
    enabled: isMaster,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_jobs_metrics', { window_minutes: windowMin });
      if (error) throw error;
      return data as unknown as Metrics;
    },
  });

  if (!isMaster) return <Navigate to="/" replace />;

  const m = metrics;
  const workerAgeSec = m?.worker?.last_finished
    ? Math.round((Date.now() - new Date(m.worker.last_finished).getTime()) / 1000)
    : null;
  const workerHealthy = workerAgeSec === null || workerAgeSec < 180;

  return (
    <PageShell
      title="Métricas de jobs"
      subtitle="Fila, falhas, retries e latência em tempo real (refresh 5s)"
      icon={<Activity className="w-4 h-4" />}
      actions={
        <div className="flex items-center gap-2">
          <Select value={String(windowMin)} onValueChange={(v) => setWindowMin(Number(v))}>
            <SelectTrigger className="h-8 text-xs w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="15">Últimos 15 min</SelectItem>
              <SelectItem value="60">Última hora</SelectItem>
              <SelectItem value="360">Últimas 6h</SelectItem>
              <SelectItem value="1440">Últimas 24h</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      }
    >
      {/* Worker health */}
      <Card className="p-3 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className={`relative flex h-2 w-2`}>
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${workerHealthy ? 'bg-emerald-500' : 'bg-destructive'}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${workerHealthy ? 'bg-emerald-500' : 'bg-destructive'}`} />
          </span>
          <span className="font-medium">Worker</span>
          <span className="text-muted-foreground">
            {m?.worker?.last_finished
              ? `último job finalizado há ${workerAgeSec}s`
              : 'aguardando primeiro job'}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          janela: {windowMin} min · gerado em {m?.generated_at ? new Date(m.generated_at).toLocaleTimeString('pt-BR') : '—'}
        </span>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
        <Stat label="Total" value={m?.status.total ?? 0} icon={ListChecks} />
        <Stat label="Pendentes" value={m?.status.pending ?? 0} icon={Clock}
              sub={`${m?.backlog_ready ?? 0} prontos p/ rodar`} tone={(m?.backlog_ready ?? 0) > 10 ? 'warn' : 'default'} />
        <Stat label="Executando" value={m?.status.running ?? 0} icon={Zap} />
        <Stat label="Sucesso" value={m?.status.success ?? 0} icon={Activity} tone="good" />
        <Stat label="Falhas" value={m?.status.failed ?? 0} icon={AlertTriangle}
              sub={`${m?.failure_rate ?? 0}% do total`}
              tone={(m?.failure_rate ?? 0) > 20 ? 'bad' : (m?.failure_rate ?? 0) > 5 ? 'warn' : 'good'} />
        <Stat label="Retries" value={m?.retried ?? 0} icon={TrendingDown}
              sub={`${m?.retry_rate ?? 0}% retentaram`}
              tone={(m?.retry_rate ?? 0) > 20 ? 'warn' : 'default'} />
      </div>

      {/* Latência */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Latência média" value={m?.latency?.avg_sec ? `${m.latency.avg_sec}s` : '—'} icon={Clock} />
        <Stat label="Latência p95" value={m?.latency?.p95_sec ? `${m.latency.p95_sec}s` : '—'} icon={Clock}
              tone={(m?.latency?.p95_sec ?? 0) > 60 ? 'warn' : 'default'} />
        <Stat label="Latência máx" value={m?.latency?.max_sec ? `${m.latency.max_sec}s` : '—'} icon={Clock} />
      </div>

      <div className="mb-4 space-y-4">
        <StoreWorkerConfigPanel />
        <ProviderGatePanel />
      </div>


      <Tabs defaultValue="companies">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="companies">Por empresa</TabsTrigger>
          <TabsTrigger value="types">Por tipo de job</TabsTrigger>
          <TabsTrigger value="errors">Erros recentes</TabsTrigger>
        </TabsList>

        <TabsContent value="companies" className="mt-3">
          <Card className="p-0 overflow-hidden">
            <ScrollArea className="h-[420px]">
              <table className="w-full text-xs">
                <thead className="text-muted-foreground border-b border-border bg-secondary/30 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Empresa</th>
                    <th className="text-right p-2">Total</th>
                    <th className="text-right p-2">Sucesso</th>
                    <th className="text-right p-2">Falhas</th>
                    <th className="text-right p-2">Pendentes</th>
                    <th className="text-right p-2">Retries</th>
                    <th className="text-right p-2">Latência</th>
                    <th className="text-left p-2">Último erro</th>
                  </tr>
                </thead>
                <tbody>
                  {(m?.per_company ?? []).map((c) => (
                    <tr key={c.company_id} className="border-b border-border/40">
                      <td className="p-2 truncate max-w-[200px]">{c.company_name ?? c.company_id.slice(0, 8)}</td>
                      <td className="p-2 text-right">{c.total}</td>
                      <td className="p-2 text-right text-emerald-500">{c.success}</td>
                      <td className="p-2 text-right">
                        {c.failed > 0 ? <Badge variant="destructive">{c.failed}</Badge> : <span className="text-muted-foreground">0</span>}
                      </td>
                      <td className="p-2 text-right">{c.pending}</td>
                      <td className="p-2 text-right">{c.retried}</td>
                      <td className="p-2 text-right">{c.avg_latency_sec ? `${c.avg_latency_sec}s` : '—'}</td>
                      <td className="p-2 truncate max-w-[260px] text-destructive" title={c.last_error ?? ''}>
                        {c.last_error ?? ''}
                      </td>
                    </tr>
                  ))}
                  {(m?.per_company?.length ?? 0) === 0 && (
                    <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">Nenhum job no período.</td></tr>
                  )}
                </tbody>
              </table>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="types" className="mt-3">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b border-border bg-secondary/30">
                <tr>
                  <th className="text-left p-2">Tipo</th>
                  <th className="text-right p-2">Total</th>
                  <th className="text-right p-2">Sucesso</th>
                  <th className="text-right p-2">Falhas</th>
                  <th className="text-right p-2">Tentativas média</th>
                </tr>
              </thead>
              <tbody>
                {(m?.per_type ?? []).map((t) => (
                  <tr key={t.job_type} className="border-b border-border/40">
                    <td className="p-2 font-mono">{t.job_type}</td>
                    <td className="p-2 text-right">{t.total}</td>
                    <td className="p-2 text-right text-emerald-500">{t.success}</td>
                    <td className="p-2 text-right">
                      {t.failed > 0 ? <Badge variant="destructive">{t.failed}</Badge> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="p-2 text-right">{t.avg_attempts}</td>
                  </tr>
                ))}
                {(m?.per_type?.length ?? 0) === 0 && (
                  <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Nenhum job no período.</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="errors" className="mt-3">
          <Card className="p-0 overflow-hidden">
            <ScrollArea className="h-[420px]">
              <div className="divide-y divide-border">
                {(m?.recent_errors ?? []).map((e) => (
                  <div key={e.id} className="p-3 text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="destructive">{e.job_type}</Badge>
                      <span className="text-muted-foreground">{e.attempts} tentativas</span>
                      <span className="text-muted-foreground">
                        {e.finished_at ? new Date(e.finished_at).toLocaleString('pt-BR') : '—'}
                      </span>
                    </div>
                    <div className="text-destructive whitespace-pre-wrap break-words">{e.last_error}</div>
                  </div>
                ))}
                {(m?.recent_errors?.length ?? 0) === 0 && (
                  <div className="p-4 text-center text-muted-foreground text-xs">Nenhum erro no período. ✨</div>
                )}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
