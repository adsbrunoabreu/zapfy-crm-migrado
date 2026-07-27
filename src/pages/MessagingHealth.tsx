import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageShell } from '@/components/layout/PageShell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, AlertTriangle, Clock, Inbox, Send, RefreshCw, MessageSquare } from 'lucide-react';

interface Metrics {
  generated_at: string;
  webhook_inbox: {
    pending: number; processing: number; failed: number; dead: number;
    oldest_pending_age_sec: number;
    avg_latency_ms_1h: number; max_latency_ms_1h: number;
  };
  outbound_queue: {
    pending: number; sending: number; failed: number; dead: number;
    total_retries: number; oldest_pending_age_sec: number;
  };
  failed_sends_24h: number;
  messages_24h: { sent: number; received: number };
}

const Stat = ({
  label, value, icon: Icon, tone = 'default', sub,
}: { label: string; value: string | number; icon: React.ElementType; tone?: 'default' | 'good' | 'warn' | 'bad'; sub?: string }) => (
  <Card className="p-4">
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <Icon className={
        tone === 'good' ? 'w-4 h-4 text-emerald-500' :
        tone === 'warn' ? 'w-4 h-4 text-yellow-500' :
        tone === 'bad'  ? 'w-4 h-4 text-destructive' : 'w-4 h-4 text-muted-foreground'
      } />
    </div>
    <div className="text-2xl font-semibold mt-1">{value}</div>
    {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
  </Card>
);

const fmtAge = (sec: number) => {
  if (!sec || sec <= 0) return '—';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
};

export default function MessagingHealth() {
  const { profile, isMaster } = useAuth();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['messaging-health-metrics'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_messaging_health_metrics');
      if (error) throw error;
      return data as unknown as Metrics;
    },
    enabled: !!isMaster,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  if (!profile) return null;
  if (!isMaster) return <Navigate to="/dashboard" replace />;

  const wh = data?.webhook_inbox;
  const oq = data?.outbound_queue;

  const whTone =
    !wh ? 'default' :
    wh.pending > 500 || wh.oldest_pending_age_sec > 300 ? 'bad' :
    wh.pending > 100 || wh.oldest_pending_age_sec > 60 ? 'warn' : 'good';

  const oqTone =
    !oq ? 'default' :
    oq.pending > 1000 || oq.dead > 200 ? 'bad' :
    oq.pending > 200 || oq.dead > 50 ? 'warn' : 'good';

  return (
    <PageShell
      title="Saúde da Mensageria"
      subtitle="Métricas em tempo real dos webhooks, filas de envio e mensagens."
      actions={
        <button
          onClick={() => refetch()}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      }
    >
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : !data ? (
        <div className="text-sm text-muted-foreground">Sem dados.</div>
      ) : (
        <div className="space-y-6">
          <div className="text-[11px] text-muted-foreground">
            Atualizado: {new Date(data.generated_at).toLocaleTimeString('pt-BR')}
          </div>

          {/* Webhook Inbox */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Inbox className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Webhooks recebidos</h2>
              <Badge variant={whTone === 'bad' ? 'destructive' : whTone === 'warn' ? 'secondary' : 'outline'}>
                {whTone === 'bad' ? 'crítico' : whTone === 'warn' ? 'atenção' : 'ok'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Pendentes" value={wh!.pending} icon={Inbox} tone={whTone} />
              <Stat label="Processando" value={wh!.processing} icon={Activity} />
              <Stat label="Falhados" value={wh!.failed} icon={AlertTriangle} tone={wh!.failed > 0 ? 'warn' : 'default'} />
              <Stat label="Mortos (dead)" value={wh!.dead} icon={AlertTriangle} tone={wh!.dead > 0 ? 'bad' : 'default'} />
              <Stat label="Mais antigo pendente" value={fmtAge(wh!.oldest_pending_age_sec)} icon={Clock} tone={whTone} />
              <Stat label="Latência média (1h)" value={`${wh!.avg_latency_ms_1h} ms`} icon={Clock}
                tone={wh!.avg_latency_ms_1h > 5000 ? 'warn' : 'good'} />
              <Stat label="Latência máx (1h)" value={`${wh!.max_latency_ms_1h} ms`} icon={Clock}
                tone={wh!.max_latency_ms_1h > 30000 ? 'bad' : wh!.max_latency_ms_1h > 10000 ? 'warn' : 'good'} />
            </div>
          </section>

          {/* Outbound Queue */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Send className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Fila de envio</h2>
              <Badge variant={oqTone === 'bad' ? 'destructive' : oqTone === 'warn' ? 'secondary' : 'outline'}>
                {oqTone === 'bad' ? 'crítico' : oqTone === 'warn' ? 'atenção' : 'ok'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Pendentes" value={oq!.pending} icon={Send} tone={oqTone} />
              <Stat label="Enviando" value={oq!.sending} icon={Activity} />
              <Stat label="Falhados" value={oq!.failed} icon={AlertTriangle} tone={oq!.failed > 0 ? 'warn' : 'default'} />
              <Stat label="Mortos (dead)" value={oq!.dead} icon={AlertTriangle} tone={oq!.dead > 0 ? 'bad' : 'default'} />
              <Stat label="Mais antigo pendente" value={fmtAge(oq!.oldest_pending_age_sec)} icon={Clock} tone={oqTone} />
              <Stat label="Total de retries" value={oq!.total_retries} icon={RefreshCw} tone={oq!.total_retries > 1000 ? 'warn' : 'default'} />
              <Stat label="Falhas de envio (24h)" value={data.failed_sends_24h} icon={AlertTriangle}
                tone={data.failed_sends_24h > 500 ? 'bad' : data.failed_sends_24h > 100 ? 'warn' : 'good'} />
            </div>
          </section>

          {/* Volume */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Volume de mensagens (24h)</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Enviadas" value={data.messages_24h.sent.toLocaleString('pt-BR')} icon={Send} />
              <Stat label="Recebidas" value={data.messages_24h.received.toLocaleString('pt-BR')} icon={Inbox} />
              <Stat label="Total" value={(data.messages_24h.sent + data.messages_24h.received).toLocaleString('pt-BR')} icon={Activity} />
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}
