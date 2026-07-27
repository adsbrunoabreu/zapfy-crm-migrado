import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageShell } from "@/components/layout/PageShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusDot } from "@/components/ui/status-dot";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, AlertCircle, BellRing, Power, RefreshCw, ScrollText, Ban } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface SystemLog {
  id: string;
  company_id: string | null;
  source: string;
  level: string;
  event: string;
  message: string;
  instance_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface ControlStatus {
  triggers: Record<string, boolean>;
  crons: Record<string, boolean>;
  queue: { pending?: number; processing?: number; failed?: number; done_24h?: number };
}

const AUTOMATION_SOURCES = [
  "attendance_auto",
  "automation",
  "sequences",
  "scheduled_messages",
  "lead_distribution",
  "auto_reconnect",
  "monitor_instances",
  "dispatch_webhooks",
];

export default function AutomationNotifications() {
  const { profile, isMaster } = useAuth();
  const companyId = profile?.company_id ?? null;

  const logsQuery = useQuery({
    queryKey: ["automation-notifications", "logs", isMaster ? "__master__" : companyId],
    enabled: isMaster || !!companyId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("system_logs")
        .select("*")
        .in("source", AUTOMATION_SOURCES)
        .in("level", ["error", "warning"])
        .order("created_at", { ascending: false })
        .limit(50);
      if (!isMaster && companyId) q = q.eq("company_id", companyId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SystemLog[];
    },
  });

  const controlQuery = useQuery({
    queryKey: ["automation-notifications", "control-status"],
    enabled: isMaster,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("automation-control", {
        body: { action: "status" },
      });
      if (error) throw new Error(error.message);
      return data as ControlStatus;
    },
  });

  const pausedTriggers = useMemo(
    () =>
      Object.entries(controlQuery.data?.triggers ?? {})
        .filter(([, on]) => !on)
        .map(([k]) => k),
    [controlQuery.data],
  );
  const pausedCrons = useMemo(
    () =>
      Object.entries(controlQuery.data?.crons ?? {})
        .filter(([, on]) => !on)
        .map(([k]) => k),
    [controlQuery.data],
  );

  const errorCount = useMemo(
    () => (logsQuery.data ?? []).filter((l) => l.level === "error").length,
    [logsQuery.data],
  );
  const warnCount = useMemo(
    () => (logsQuery.data ?? []).filter((l) => l.level === "warning").length,
    [logsQuery.data],
  );

  const queue = controlQuery.data?.queue ?? {};
  const failedQueue = queue.failed ?? 0;

  return (
    <PageShell
      title="Notificações"
      subtitle={
        isMaster
          ? "Falhas, gatilhos pausados e eventos recentes em toda a plataforma"
          : "Falhas e eventos recentes das automações da sua empresa"
      }
      icon={<BellRing className="h-4 w-4" />}
      actions={
        <Button variant="outline" size="sm" onClick={() => { logsQuery.refetch(); controlQuery.refetch(); }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Atualizar
        </Button>
      }
    >

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Erros (50 recentes)" value={errorCount} icon={AlertCircle} tone={errorCount ? 'rose' : 'muted'} />
        <KpiCard label="Avisos (50 recentes)" value={warnCount} icon={AlertTriangle} tone={warnCount ? 'amber' : 'muted'} />
        {isMaster && (
          <>
            <KpiCard label="Triggers pausados" value={pausedTriggers.length} icon={Power} tone={pausedTriggers.length ? 'rose' : 'muted'} />
            <KpiCard label="Crons pausados" value={pausedCrons.length} icon={Power} tone={pausedCrons.length ? 'rose' : 'muted'} />
          </>
        )}
        {!isMaster && (
          <>
            <KpiCard label="Fila pendente" value={queue.pending ?? 0} icon={Loader2} tone={queue.pending ? 'cyan' : 'muted'} />
            <KpiCard label="Fila com falha" value={failedQueue} icon={Ban} tone={failedQueue ? 'rose' : 'muted'} />
          </>
        )}
      </div>

      {/* Master: Trigger/Cron status */}
      {isMaster && (pausedTriggers.length > 0 || pausedCrons.length > 0) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Sistema em modo manual</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>Existem automações desativadas. Nenhum disparo ocorrerá até reativá-las.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {pausedTriggers.map((t) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded border border-border/60 bg-background/40">
                  trigger · {t}
                </span>
              ))}
              {pausedCrons.map((c) => (
                <span key={c} className="text-xs px-2 py-0.5 rounded border border-border/60 bg-background/40">
                  cron · {c}
                </span>
              ))}
            </div>
            <div className="pt-2">
              <Button asChild size="sm" variant="outline">
                <Link to="/admin/automations">
                  <Power className="w-4 h-4 mr-2" /> Abrir controle
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Logs recentes */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Eventos recentes</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to={isMaster ? "/admin/logs" : "#"} className={!isMaster ? "pointer-events-none opacity-50" : ""}>
              <ScrollText className="w-4 h-4 mr-2" /> Ver logs completos
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {logsQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (logsQuery.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nenhuma falha ou aviso de automação nos eventos recentes.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {(logsQuery.data ?? []).map((log) => (
                <li key={log.id} className="py-3 flex items-start gap-3">
                  <StatusDot tone={log.level === "error" ? "error" : "pending"} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">{log.event}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {log.source}
                      </span>
                    </div>
                    {log.message && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{log.message}</p>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(log.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "active" | "pending" | "inactive" | "error" | "info";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <StatusDot tone={tone} />
        </div>
        <div className="text-2xl font-semibold mt-1 text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}
