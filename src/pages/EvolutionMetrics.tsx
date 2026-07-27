import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, AlertTriangle, RefreshCw, Clock, ServerCrash, Search, ShieldCheck, ShieldAlert } from 'lucide-react';

interface Row {
  company_id: string;
  company_name: string | null;
  instance_name: string;
  total_calls: number;
  errors: number;
  not_found: number;
  server_errors: number;
  rate_limited: number;
  network_errors: number;
  error_rate: number | null;
  not_found_rate: number | null;
  server_error_rate: number | null;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  last_event_at: string | null;
}

const Stat = ({ label, value, icon: Icon, tone = 'default', sub }: {
  label: string; value: string | number; icon: React.ElementType;
  tone?: 'default' | 'good' | 'warn' | 'bad'; sub?: string;
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

export default function EvolutionMetrics() {
  const { isMaster } = useAuth();
  const [hours, setHours] = useState(24);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ['evolution-proxy-metrics', hours],
    enabled: isMaster,
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_evolution_proxy_metrics', {
        _hours: hours,
        _company_id: null,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  if (isMaster === false) return <Navigate to="/" replace />;

  const rows = data ?? [];
  const totals = rows.reduce(
    (acc, r) => {
      acc.calls += r.total_calls;
      acc.errors += r.errors;
      acc.notFound += r.not_found;
      acc.server += r.server_errors;
      acc.network += r.network_errors;
      acc.latencySum += (r.avg_latency_ms ?? 0) * r.total_calls;
      return acc;
    },
    { calls: 0, errors: 0, notFound: 0, server: 0, network: 0, latencySum: 0 },
  );
  const errorRate = totals.calls ? (100 * totals.errors / totals.calls) : 0;
  const avgLatency = totals.calls ? Math.round(totals.latencySum / totals.calls) : 0;

  return (
    <PageShell
      title="Métricas Evolution Proxy"
      subtitle="Monitoramento de chamadas à Evolution API por instância e empresa"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Select value={String(hours)} onValueChange={(v) => setHours(Number(v))}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Última 1 hora</SelectItem>
              <SelectItem value="6">Últimas 6 horas</SelectItem>
              <SelectItem value="24">Últimas 24 horas</SelectItem>
              <SelectItem value="72">Últimos 3 dias</SelectItem>
              <SelectItem value="168">Últimos 7 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Total de chamadas" value={totals.calls.toLocaleString('pt-BR')} icon={Activity} />
        <Stat
          label="Taxa de erro"
          value={`${errorRate.toFixed(1)}%`}
          icon={AlertTriangle}
          tone={errorRate > 10 ? 'bad' : errorRate > 3 ? 'warn' : 'good'}
        />
        <Stat label="404 (não encontrado)" value={totals.notFound} icon={Search} tone={totals.notFound ? 'warn' : 'default'} />
        <Stat label="5xx (servidor)" value={totals.server} icon={ServerCrash} tone={totals.server ? 'bad' : 'good'} />
        <Stat label="Latência média" value={`${avgLatency} ms`} icon={Clock} />
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-4 py-2 text-sm font-medium">Por instância</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Empresa</th>
                <th className="text-left px-3 py-2">Instância</th>
                <th className="text-right px-3 py-2">Chamadas</th>
                <th className="text-right px-3 py-2">Erros</th>
                <th className="text-right px-3 py-2">404</th>
                <th className="text-right px-3 py-2">5xx</th>
                <th className="text-right px-3 py-2">Rede</th>
                <th className="text-right px-3 py-2">Lat. média</th>
                <th className="text-right px-3 py-2">p95</th>
                <th className="text-left px-3 py-2">Último evento</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                    Nenhuma chamada registrada no período.
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const er = r.error_rate ?? 0;
                return (
                  <tr key={`${r.company_id}-${r.instance_name}`} className="border-t border-border hover:bg-muted/20">
                    <td className="px-3 py-2">{r.company_name ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.instance_name}</td>
                    <td className="px-3 py-2 text-right">{r.total_calls.toLocaleString('pt-BR')}</td>
                    <td className="px-3 py-2 text-right">
                      <Badge variant={er > 10 ? 'destructive' : er > 3 ? 'secondary' : 'outline'}>
                        {r.errors} ({er.toFixed(1)}%)
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">{r.not_found}</td>
                    <td className="px-3 py-2 text-right">{r.server_errors}</td>
                    <td className="px-3 py-2 text-right">{r.network_errors}</td>
                    <td className="px-3 py-2 text-right">{r.avg_latency_ms ?? '—'} ms</td>
                    <td className="px-3 py-2 text-right">{r.p95_latency_ms ?? '—'} ms</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.last_event_at ? new Date(r.last_event_at).toLocaleString('pt-BR') : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <CloudApiDiagnosticsCard hours={hours} />
    </PageShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Cloud API (Meta) diagnostics — últimas entradas de message_sync_log
// ─────────────────────────────────────────────────────────────────────

interface CloudLog {
  id: string;
  created_at: string;
  event: string;
  status: string | null;
  error_message: string | null;
  company_id: string;
  metadata: Record<string, unknown> | null;
}

const CLOUD_EVENT_LABEL: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'default' }> = {
  'cloud.persisted': { label: 'Mensagem recebida', tone: 'good' },
  'cloud.statuses': { label: 'Status atualizado', tone: 'good' },
  'cloud.signature_invalid': { label: 'Assinatura inválida', tone: 'bad' },
  'cloud.signature_missing': { label: 'Assinatura ausente', tone: 'bad' },
  'cloud.hmac_skipped': { label: 'HMAC não verificado', tone: 'warn' },
  'cloud.instance_not_found': { label: 'Instância não encontrada', tone: 'bad' },
  'cloud.bad_envelope': { label: 'Envelope inválido', tone: 'warn' },
  'message.sent': { label: 'Mensagem enviada', tone: 'good' },
};

function CloudApiDiagnosticsCard({ hours }: { hours: number }) {
  const { data, isFetching, refetch } = useQuery({
    queryKey: ['cloud-api-logs', hours],
    refetchInterval: 30000,
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
      const { data, error } = await supabase
        .from('message_sync_log')
        .select('id, created_at, event, status, error_message, company_id, metadata')
        .eq('provider', 'cloud_api')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as CloudLog[];
    },
  });

  const rows = data ?? [];
  const hmacSkipped = rows.filter(r => r.event === 'cloud.hmac_skipped').length;
  const totalEvents = rows.length;
  const errors = rows.filter(r => r.status === 'error').length;

  return (
    <Card className="overflow-hidden mt-6">
      <div className="border-b border-border px-4 py-2 text-sm font-medium flex items-center justify-between">
        <span className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-primary" />
          Cloud API (Meta) — últimos eventos
        </span>
        <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-px bg-border">
        <div className="bg-card p-3">
          <div className="text-xs text-muted-foreground">Eventos no período</div>
          <div className="text-lg font-semibold">{totalEvents}</div>
        </div>
        <div className="bg-card p-3">
          <div className="text-xs text-muted-foreground">Erros</div>
          <div className={`text-lg font-semibold ${errors ? 'text-destructive' : ''}`}>{errors}</div>
        </div>
        <div className="bg-card p-3">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            {hmacSkipped > 0 ? <ShieldAlert className="w-3 h-3 text-yellow-500" /> : <ShieldCheck className="w-3 h-3 text-emerald-500" />}
            HMAC não verificado
          </div>
          <div className={`text-lg font-semibold ${hmacSkipped ? 'text-yellow-500' : ''}`}>{hmacSkipped}</div>
        </div>
      </div>

      {hmacSkipped > 0 && (
        <div className="px-4 py-2 text-xs bg-yellow-500/10 border-t border-yellow-500/20 text-yellow-500">
          Algumas instâncias Cloud API não têm <code className="font-mono">appSecret</code> configurado. Os webhooks são processados, mas não há validação HMAC. Configure em Conexões → API Oficial.
        </div>
      )}

      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs text-muted-foreground sticky top-0">
            <tr>
              <th className="text-left px-3 py-2">Quando</th>
              <th className="text-left px-3 py-2">Evento</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Mensagem</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum evento Cloud API registrado no período.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const cfg = CLOUD_EVENT_LABEL[r.event] ?? { label: r.event, tone: 'default' as const };
              const toneClass =
                cfg.tone === 'bad' ? 'text-destructive' :
                cfg.tone === 'warn' ? 'text-yellow-500' :
                cfg.tone === 'good' ? 'text-emerald-500' : '';
              return (
                <tr key={r.id} className="border-t border-border hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className={`px-3 py-2 text-xs font-medium ${toneClass}`}>{cfg.label}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.status && (
                      <Badge variant={r.status === 'error' ? 'destructive' : r.status === 'warning' ? 'secondary' : 'outline'}>
                        {r.status}
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-md" title={r.error_message ?? ''}>
                    {r.error_message ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
