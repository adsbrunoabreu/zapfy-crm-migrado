import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Eye, AlertCircle, CheckCircle2, RotateCcw, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type LogRow = {
  id: string;
  company_id: string | null;
  direction: 'proxy_request' | 'webhook_in';
  action: string | null;
  event: string | null;
  http_status: number | null;
  ok: boolean;
  request_payload: any;
  response_payload: any;
  error_message: string | null;
  environment: string | null;
  asaas_payment_id: string | null;
  retry_of: string | null;
  created_at: string;
};

type Filter = 'all' | 'errors' | 'webhook' | 'outbound';

export const AsaasLogsCard = () => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<LogRow | null>(null);

  const { data: logs = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['asaas-logs', filter],
    queryFn: async () => {
      let q = supabase
        .from('asaas_logs' as any)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (filter === 'errors') q = q.eq('ok', false);
      if (filter === 'webhook') q = q.eq('direction', 'webhook_in');
      if (filter === 'outbound') q = q.eq('direction', 'proxy_request');
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as LogRow[];
    },
    staleTime: 30_000,
  });

  const retry = useMutation({
    mutationFn: async (logId: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { data, error } = await supabase.functions.invoke('asaas-proxy', {
        body: { action: 'retryLog', log_id: logId },
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctx: any = (error as any)?.context;
          if (ctx?.clone) {
            const j = JSON.parse(await ctx.clone().text());
            if (j?.error) msg = j.error;
          }
        } catch {}
        throw new Error(msg);
      }
      return data;
    },
    onSuccess: () => {
      toast.success('Reenvio executado');
      qc.invalidateQueries({ queryKey: ['asaas-logs'] });
      setSelected(null);
    },
    onError: (e: any) => toast.error(e?.message || 'Falha ao reenviar'),
  });

  const counts = {
    total: logs.length,
    errors: logs.filter((l) => !l.ok).length,
  };

  return (
    <>
      <Card id="asaas-logs" className="scroll-mt-20">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                Logs e retry da integração Asaas
              </CardTitle>
              <CardDescription>
                Últimas 100 chamadas (saída/entrada). Erros podem ser reenviados.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList>
                <TabsTrigger value="all">Todos</TabsTrigger>
                <TabsTrigger value="errors">
                  Erros {counts.errors > 0 && <Badge variant="destructive" className="ml-2">{counts.errors}</Badge>}
                </TabsTrigger>
                <TabsTrigger value="outbound">Saída</TabsTrigger>
                <TabsTrigger value="webhook">Webhook</TabsTrigger>
              </TabsList>
            </Tabs>
            <span className="text-xs text-muted-foreground">{counts.total} registros</span>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Carregando...</div>
          ) : logs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed border-border rounded">
              Sem registros para o filtro atual.
            </div>
          ) : (
            <div className="border border-border rounded divide-y divide-border max-h-[480px] overflow-auto">
              {logs.map((l) => (
                <div key={l.id} className="flex items-center gap-3 p-3 hover:bg-muted/30 text-sm">
                  <div className="shrink-0">
                    {l.direction === 'webhook_in' ? (
                      <ArrowDownLeft className="h-4 w-4 text-blue-400" />
                    ) : (
                      <ArrowUpRight className="h-4 w-4 text-purple-400" />
                    )}
                  </div>
                  <div className="shrink-0">
                    {l.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{l.action || l.event || '—'}</span>
                      {l.http_status && (
                        <Badge variant="outline" className="h-5 text-[10px]">{l.http_status}</Badge>
                      )}
                      {l.environment && (
                        <Badge variant="outline" className="h-5 text-[10px]">{l.environment}</Badge>
                      )}
                      {l.retry_of && (
                        <Badge variant="outline" className="h-5 text-[10px] border-amber-500/40 text-amber-500">retry</Badge>
                      )}
                    </div>
                    {l.error_message && (
                      <div className="text-xs text-rose-400 truncate mt-0.5">{l.error_message}</div>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(l.created_at), 'dd/MM HH:mm:ss', { locale: ptBR })}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelected(l)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-500" />
              )}
              {selected?.action || selected?.event || 'Log'}
              {selected?.http_status && (
                <Badge variant="outline">{selected.http_status}</Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-4 pr-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Direção:</span> {selected.direction === 'webhook_in' ? 'Entrada (webhook)' : 'Saída (API)'}</div>
                  <div><span className="text-muted-foreground">Ambiente:</span> {selected.environment || '—'}</div>
                  <div><span className="text-muted-foreground">Pagamento Asaas:</span> {selected.asaas_payment_id || '—'}</div>
                  <div><span className="text-muted-foreground">Quando:</span> {format(new Date(selected.created_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}</div>
                </div>

                {selected.error_message && (
                  <div className="rounded border border-rose-500/30 bg-rose-500/5 p-3">
                    <div className="text-xs font-medium text-rose-400 mb-1">Mensagem de erro</div>
                    <div className="text-sm">{selected.error_message}</div>
                  </div>
                )}

                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Payload da requisição</div>
                  <pre className="text-[11px] bg-muted/40 p-3 rounded border border-border overflow-auto">
                    {JSON.stringify(selected.request_payload, null, 2)}
                  </pre>
                </div>

                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Resposta</div>
                  <pre className="text-[11px] bg-muted/40 p-3 rounded border border-border overflow-auto">
                    {JSON.stringify(selected.response_payload, null, 2)}
                  </pre>
                </div>

                {selected.direction === 'proxy_request' && !selected.ok && selected.action !== 'ping' && (
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => retry.mutate(selected.id)} disabled={retry.isPending}>
                      {retry.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RotateCcw className="h-4 w-4 mr-2" />
                      )}
                      Reenviar requisição
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
