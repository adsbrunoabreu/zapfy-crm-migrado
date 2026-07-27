import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, AlertTriangle, RefreshCw, Power, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const TRIGGERS = [
  { slug: "auto_reply", label: "Auto-reply (welcome / off-hours)" },
  { slug: "sequences", label: "Sequências (follow-up de leads)" },
  { slug: "webhooks", label: "Webhooks (eventos externos)" },
  { slug: "lead_distribution", label: "Distribuição automática de leads" },
];

const CRONS = [
  { slug: "process_attendance_queue", label: "Process attendance queue (1 min)" },
  { slug: "process_scheduled_messages", label: "Send scheduled messages (1 min)" },
  { slug: "process_sequences", label: "Process sequences (1 min)" },
  { slug: "monitor_instances", label: "Monitor instances (1 min)" },
  { slug: "auto_reconnect", label: "Auto-reconnect instances (1 min)" },
];

type StatusResponse = {
  triggers: Record<string, boolean>;
  crons: Record<string, boolean>;
  queue: { pending?: number; processing?: number; failed?: number; done_24h?: number };
};

async function callControl(action: string, body: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("automation-control", {
    body: { action, ...body },
  });
  if (error) {
    const ctx = await error.context?.json?.().catch(() => null);
    throw new Error(ctx?.error || error.message);
  }
  return data;
}

export function AutomationsTab() {
  const qc = useQueryClient();
  const [selTriggers, setSelTriggers] = useState<string[]>([]);
  const [selCrons, setSelCrons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState<null | { kind: "triggers" | "crons"; slugs: string[]; label: string }>(null);

  const { data: status, isLoading, refetch } = useQuery<StatusResponse>({
    queryKey: ["automation-control-status"],
    queryFn: async () => callControl("status") as Promise<StatusResponse>,
    refetchInterval: 15_000,
  });

  const { data: logs } = useQuery({
    queryKey: ["automation-control-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_logs")
        .select("id, level, event, message, metadata, created_at")
        .eq("source", "automation_control")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 20_000,
  });

  const allTriggersOff = TRIGGERS.every((t) => !status?.triggers?.[t.slug]);
  const allCronsOff = CRONS.every((c) => !status?.crons?.[c.slug]);
  const fullyPaused = allTriggersOff && allCronsOff;

  const doToggle = async (kind: "triggers" | "crons", slugs: string[], enable: boolean) => {
    setBusy(true);
    try {
      await callControl(kind === "triggers" ? "toggle_triggers" : "toggle_crons", { slugs, enable });
      toast({ title: enable ? "Ativado" : "Desativado", description: `${slugs.length} item(ns) atualizado(s).` });
      if (kind === "triggers") setSelTriggers([]);
      else setSelCrons([]);
      await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ["automation-control-logs"] })]);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      setConfirmOpen(null);
    }
  };

  const dispatchCron = async (slug: string) => {
    setBusy(true);
    try {
      const r = await callControl("manual_dispatch", { cron_slug: slug });
      toast({ title: "Disparado", description: `HTTP ${r?.status ?? "?"}` });
      await qc.invalidateQueries({ queryKey: ["automation-control-logs"] });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Controle Global de Automações</h2>
          <p className="text-xs text-muted-foreground">Reativar triggers e cron jobs sob demanda.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Recarregar
        </Button>
      </div>

      <Alert className={fullyPaused ? "border-amber bg-amber/30" : "border-emerald bg-emerald/20"}>
        <AlertTriangle className={`h-5 w-5 ${fullyPaused ? "text-amber" : "text-emerald"}`} />
        <AlertTitle className="text-base">
          {fullyPaused ? "⚠️ AUTOMAÇÕES PAUSADAS" : "Automações parcialmente ativas"}
        </AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Status: {fullyPaused
            ? "TODOS os triggers e crons desativados — sistema em modo manual."
            : `${TRIGGERS.filter((t) => status?.triggers?.[t.slug]).length}/${TRIGGERS.length} triggers • ${CRONS.filter((c) => status?.crons?.[c.slug]).length}/${CRONS.length} crons ativos.`}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Pendentes na fila" value={status?.queue?.pending ?? 0} />
        <StatCard label="Processando" value={status?.queue?.processing ?? 0} />
        <StatCard label="Bloqueadas (failed)" value={status?.queue?.failed ?? 0} accent="text-destructive" />
        <StatCard label="Processadas (24h)" value={status?.queue?.done_24h ?? 0} accent="text-emerald" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Power className="h-4 w-4" /> Reativar triggers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {TRIGGERS.map((t) => {
            const on = !!status?.triggers?.[t.slug];
            return (
              <div key={t.slug} className="flex items-center justify-between border border-border rounded p-3 bg-background">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selTriggers.includes(t.slug)}
                    onCheckedChange={(c) =>
                      setSelTriggers((s) => (c ? [...s, t.slug] : s.filter((x) => x !== t.slug)))
                    }
                  />
                  <div>
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-xs text-muted-foreground">slug: {t.slug}</div>
                  </div>
                </div>
                <Badge variant={on ? "default" : "secondary"} className={on ? "bg-emerald" : ""}>
                  {on ? "ATIVO" : "DESATIVADO"}
                </Badge>
              </div>
            );
          })}
          <div className="flex gap-2 pt-2 flex-wrap">
            <Button variant="destructive" disabled={busy || selTriggers.length === 0}
              onClick={() => doToggle("triggers", selTriggers, true)}>
              Ativar selecionadas ({selTriggers.length})
            </Button>
            <Button variant="outline" disabled={busy || selTriggers.length === 0}
              onClick={() => doToggle("triggers", selTriggers, false)}>
              Desativar selecionadas
            </Button>
            <Button variant="destructive" disabled={busy}
              onClick={() => setConfirmOpen({ kind: "triggers", slugs: TRIGGERS.map((t) => t.slug), label: "TODOS os triggers" })}>
              ⚠️ Ativar TUDO
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Power className="h-4 w-4" /> Cron jobs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {CRONS.map((c) => {
            const on = !!status?.crons?.[c.slug];
            return (
              <div key={c.slug} className="flex items-center justify-between border border-border rounded p-3 bg-background">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selCrons.includes(c.slug)}
                    onCheckedChange={(v) =>
                      setSelCrons((s) => (v ? [...s, c.slug] : s.filter((x) => x !== c.slug)))
                    }
                  />
                  <div>
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="text-xs text-muted-foreground">slug: {c.slug}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={on ? "default" : "secondary"} className={on ? "bg-emerald" : ""}>
                    {on ? "AGENDADO" : "PARADO"}
                  </Badge>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => dispatchCron(c.slug)}>
                    <Play className="h-3 w-3 mr-1" /> Disparar agora
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="flex gap-2 pt-2 flex-wrap">
            <Button variant="destructive" disabled={busy || selCrons.length === 0}
              onClick={() => doToggle("crons", selCrons, true)}>
              Ativar selecionados ({selCrons.length})
            </Button>
            <Button variant="outline" disabled={busy || selCrons.length === 0}
              onClick={() => doToggle("crons", selCrons, false)}>
              Desativar selecionados
            </Button>
            <Button variant="destructive" disabled={busy}
              onClick={() => setConfirmOpen({ kind: "crons", slugs: CRONS.map((c) => c.slug), label: "TODOS os cron jobs" })}>
              ⚠️ Ativar TUDO
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas ações (auditoria)</CardTitle>
        </CardHeader>
        <CardContent>
          {logs && logs.length > 0 ? (
            <div className="space-y-2">
              {logs.map((l: any) => (
                <div key={l.id} className="text-xs border border-border rounded p-2 bg-background">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className="text-[10px]"
                      variant={l.level === "warn" ? "destructive" : l.level === "info" ? "default" : "secondary"}>
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
            <p className="text-sm text-muted-foreground">Sem ações recentes.</p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirmOpen} onOpenChange={(o) => !o && setConfirmOpen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar {confirmOpen?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação reativará todos os itens listados imediatamente. Mensagens e webhooks voltarão a ser
              disparados de forma automática. Tem certeza?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy}
              onClick={() => confirmOpen && doToggle(confirmOpen.kind, confirmOpen.slugs, true)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sim, ativar TUDO"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase text-muted-foreground">{label}</div>
        <div className={`text-3xl font-bold ${accent ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
