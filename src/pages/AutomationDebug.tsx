import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Play, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const DAYS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
];

type Settings = {
  company_id: string;
  general: any;
  business_hours: any;
};

export default function AutomationDebug() {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["debug-attendance-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_settings")
        .select("company_id, general, business_hours")
        .maybeSingle();
      if (error) throw error;
      return data as Settings | null;
    },
  });

  const { data: queueStats, isLoading: loadingQueue, refetch: refetchQueue } = useQuery({
    queryKey: ["debug-queue-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_auto_message_queue")
        .select("status")
        .limit(1000);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        counts[r.status] = (counts[r.status] ?? 0) + 1;
      });
      return counts;
    },
    refetchInterval: 10_000,
  });

  const { data: logs, isLoading: loadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ["debug-attendance-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_logs")
        .select("id, level, event, message, metadata, created_at")
        .eq("source", "attendance_auto")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000,
  });

  const welcomeEnabled = settings?.general?.welcome_enabled === true;
  const welcomeMsg = settings?.general?.welcome_message ?? "";
  const showWait = settings?.general?.show_wait_time === true;
  const offHoursEnabled = settings?.business_hours?.off_hours_enabled === true;
  const offHoursMsg = settings?.business_hours?.off_hours_message ?? "";
  const days = settings?.business_hours?.days ?? {};

  const runProcessor = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("process-attendance-queue", {
        body: { manual: true },
      });
      if (error) throw error;
      toast({ title: "Processador disparado", description: JSON.stringify(data ?? {}).slice(0, 200) });
      await Promise.all([refetchQueue(), refetchLogs()]);
    } catch (e: any) {
      const ctx = e?.context ? await e.context.json?.().catch(() => null) : null;
      toast({
        title: "Erro ao processar",
        description: ctx?.error || e?.message || "Falha desconhecida",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Debug — Automações de Atendimento</h1>
          <p className="text-sm text-muted-foreground">Estado atual das flags, fila e logs (read-only).</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries()}
          disabled={loadingSettings || loadingQueue || loadingLogs}
        >
          <RefreshCw className="h-4 w-4 mr-2" /> Recarregar
        </Button>
      </div>

      {/* Flags */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Welcome (boas-vindas)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <StatusBadge active={welcomeEnabled} />
              <span className="text-xs text-muted-foreground">
                {settings?.general?.welcome_enabled === undefined ? "(flag não definida)" : ""}
              </span>
            </div>
            <p className="text-xs mt-2 text-muted-foreground line-clamp-2">{welcomeMsg || "(sem mensagem)"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Off-hours (fora do horário)</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge active={offHoursEnabled} />
            <p className="text-xs mt-2 text-muted-foreground line-clamp-2">{offHoursMsg || "(sem mensagem)"}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tempo de espera</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge active={showWait} />
          </CardContent>
        </Card>
      </div>

      {/* Horários */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Horário comercial por dia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-2 text-center text-xs">
            {DAYS.map((d) => {
              const cfg = days?.[d.key];
              const enabled = cfg?.enabled === true;
              return (
                <div
                  key={d.key}
                  className={`p-2 rounded border ${
                    enabled ? "border-emerald-700 bg-emerald-950/30" : "border-border bg-background"
                  }`}
                >
                  <div className="font-medium">{d.label}</div>
                  {enabled ? (
                    <div className="text-muted-foreground">
                      {cfg?.start} – {cfg?.end}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">off</div>
                  )}
                </div>
              );
            })}
          </div>
          {DAYS.every((d) => !days?.[d.key]?.enabled) && (
            <div className="mt-3 flex items-start gap-2 text-xs text-amber-400">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>
                Nenhum dia habilitado: <code>is_off_business_hours</code> sempre retorna verdadeiro. Se welcome
                estiver ativo, ele será enfileirado em toda mensagem inbound.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Fila */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Fila de auto-respostas</CardTitle>
          <Button size="sm" onClick={runProcessor} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Processar agora
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {["pending", "processing", "done", "failed", "cancelled"].map((s) => (
              <div key={s} className="p-3 rounded border border-border bg-background">
                <div className="text-xs uppercase text-muted-foreground">{s}</div>
                <div className="text-2xl font-bold">{queueStats?.[s] ?? 0}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Logs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimos eventos do trigger</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingLogs ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : logs && logs.length > 0 ? (
            <div className="space-y-2">
              {logs.map((l: any) => (
                <div key={l.id} className="text-xs border border-border rounded p-2 bg-background">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={l.event === "enqueued" ? "default" : "secondary"} className="text-[10px]">
                      {l.event}
                    </Badge>
                    <span className="text-muted-foreground">{new Date(l.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <div>{l.message}</div>
                  {l.metadata && (
                    <pre className="mt-1 text-[10px] text-muted-foreground overflow-x-auto">
                      {JSON.stringify(l.metadata, null, 0)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem eventos recentes.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge className="bg-emerald-600 hover:bg-emerald-600">
      <CheckCircle2 className="h-3 w-3 mr-1" /> Ativo
    </Badge>
  ) : (
    <Badge variant="secondary">Inativo</Badge>
  );
}
