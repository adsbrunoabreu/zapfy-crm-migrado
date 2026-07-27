import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useState } from 'react';
import { Play, RefreshCw, XCircle, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

interface Job {
  id: string;
  job_type: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  attempts: number;
  max_attempts: number;
  next_run_at: string;
  last_error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
interface Log {
  id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
  details: Record<string, unknown>;
  job_id: string | null;
  created_at: string;
}

const statusVariant = (s: Job['status']) =>
  s === 'success' ? 'default'
  : s === 'failed' ? 'destructive'
  : s === 'cancelled' ? 'outline'
  : 'secondary';

const sevIcon = (s: Log['severity']) =>
  s === 'error' ? <XCircle className="w-3.5 h-3.5 text-destructive" />
  : s === 'warning' ? <AlertTriangle className="w-3.5 h-3.5 text-amber" />
  : <CheckCircle2 className="w-3.5 h-3.5 text-emerald" />;

export function StoreJobsAuditPanel({ companyId }: { companyId?: string }) {
  const qc = useQueryClient();
  const [jobType, setJobType] = useState<'sync' | 'test' | 'webhooks' | 'rotate_webhooks'>('sync');

  const { data: jobs = [], isFetching: lj } = useQuery({
    queryKey: ['store-jobs', companyId],
    enabled: !!companyId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('store-proxy', {
        body: { action: 'list_jobs', limit: 30, ...(companyId ? { company_id: companyId } : {}) },
      });
      return ((data as { jobs?: Job[] })?.jobs ?? []) as Job[];
    },
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['store-logs', companyId],
    enabled: !!companyId,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('store-proxy', {
        body: { action: 'list_logs', limit: 80, ...(companyId ? { company_id: companyId } : {}) },
      });
      return ((data as { logs?: Log[] })?.logs ?? []) as Log[];
    },
  });

  const enqueue = useMutation({
    mutationFn: async (type: string) => {
      const { data, error } = await supabase.functions.invoke('store-proxy', {
        body: { action: 'enqueue_job', job_type: type, ...(companyId ? { company_id: companyId } : {}) },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Job enfileirado');
      qc.invalidateQueries({ queryKey: ['store-jobs'] });
      qc.invalidateQueries({ queryKey: ['store-logs'] });
    },
    onError: (e: Error) => toast.error(e.message ?? 'Falha ao enfileirar'),
  });

  const cancel = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase.functions.invoke('store-proxy', {
        body: { action: 'cancel_job', job_id: jobId, ...(companyId ? { company_id: companyId } : {}) },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Job cancelado');
      qc.invalidateQueries({ queryKey: ['store-jobs'] });
    },
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Jobs e auditoria</h3>
          <p className="text-xs text-muted-foreground">Re-tentativas automáticas com backoff exponencial. O worker roda a cada 1 min.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={jobType} onValueChange={(v) => setJobType(v as typeof jobType)}>
            <SelectTrigger className="w-[170px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sync">Sincronizar produtos</SelectItem>
              <SelectItem value="test">Testar conexão</SelectItem>
              <SelectItem value="webhooks">Registrar webhooks</SelectItem>
              <SelectItem value="rotate_webhooks">Rotacionar webhooks</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => enqueue.mutate(jobType)} disabled={enqueue.isPending}>
            <Play className="w-3.5 h-3.5 mr-1" /> Enfileirar
          </Button>
          <Button size="sm" variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ['store-jobs'] })}>
            <RefreshCw className={`w-3.5 h-3.5 ${lj ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="jobs">
        <TabsList className="bg-secondary/50">
          <TabsTrigger value="jobs">Fila ({jobs.length})</TabsTrigger>
          <TabsTrigger value="logs">Logs ({logs.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-3">
          <ScrollArea className="h-[280px] pr-2">
            {jobs.length === 0 && <p className="text-xs text-muted-foreground p-3">Nenhum job ainda.</p>}
            <div className="space-y-1.5">
              {jobs.map((j) => (
                <div key={j.id} className="text-xs flex items-center gap-2 border border-border rounded px-2 py-1.5 bg-secondary/30">
                  <Badge variant={statusVariant(j.status)} className="capitalize">{j.status}</Badge>
                  <span className="font-mono">{j.job_type}</span>
                  <span className="text-muted-foreground">{j.attempts}/{j.max_attempts}</span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(j.next_run_at).toLocaleTimeString('pt-BR')}
                  </span>
                  {j.last_error && <span className="text-destructive truncate flex-1" title={j.last_error}>{j.last_error}</span>}
                  {!j.last_error && <span className="flex-1" />}
                  {j.status === 'pending' && (
                    <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => cancel.mutate(j.id)}>
                      Cancelar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="logs" className="mt-3">
          <ScrollArea className="h-[280px] pr-2">
            {logs.length === 0 && <p className="text-xs text-muted-foreground p-3">Nenhum evento registrado.</p>}
            <div className="space-y-1">
              {logs.map((l) => (
                <div key={l.id} className="text-xs flex items-start gap-2 border-b border-border/60 px-1 py-1.5">
                  {sevIcon(l.severity)}
                  <span className="text-muted-foreground w-[70px] shrink-0">
                    {new Date(l.created_at).toLocaleTimeString('pt-BR')}
                  </span>
                  <span className="font-mono w-[180px] shrink-0 truncate">{l.event_type}</span>
                  <span className="flex-1 truncate" title={l.message}>{l.message}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
