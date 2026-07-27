import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronRight, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { AVAILABLE_EVENTS, type Delivery, type WebhookRecord, statusBadge } from './constants';

interface Props {
  companyId: string | undefined;
  webhooks: WebhookRecord[];
}

export function DeliveriesPanel({ companyId, webhooks }: Props) {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterEvent, setFilterEvent] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: deliveries = [], isLoading } = useQuery({
    queryKey: ['webhook-deliveries', companyId, filterStatus, filterEvent],
    enabled: !!companyId,
    refetchInterval: 15000,
    queryFn: async () => {
      let q = supabase
        .from('webhook_deliveries')
        .select('*')
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false })
        .limit(100);
      if (filterStatus !== 'all') q = q.eq('status', filterStatus);
      if (filterEvent !== 'all') q = q.eq('event', filterEvent);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Delivery[];
    },
  });

  const resendMut = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke('webhooks-dispatcher', {
        body: { action: 'resend', delivery_id: id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Reenviado');
      qc.invalidateQueries({ queryKey: ['webhook-deliveries', companyId] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Erro'),
  });

  const webhookMap = useMemo(
    () => Object.fromEntries(webhooks.map((w) => [w.id, w])),
    [webhooks],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44 bg-card border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="success">Sucesso</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="failed">Falhou</SelectItem>
            <SelectItem value="dead">Definitivo</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterEvent} onValueChange={setFilterEvent}>
          <SelectTrigger className="w-56 bg-card border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os eventos</SelectItem>
            {AVAILABLE_EVENTS.map((e) => (
              <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
            ))}
            <SelectItem value="webhook.test">webhook.test</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          onClick={() => qc.invalidateQueries({ queryKey: ['webhook-deliveries', companyId] })}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </div>

      {isLoading && (
        <div className="text-muted-foreground/80 text-sm py-8 text-center">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" /> Carregando…
        </div>
      )}
      {!isLoading && deliveries.length === 0 && (
        <div className="text-muted-foreground/80 text-sm py-8 text-center border border-dashed border-border rounded-lg">
          Nenhuma entrega encontrada.
        </div>
      )}

      <div className="space-y-2">
        {deliveries.map((d) => {
          const isOpen = expanded === d.id;
          const wh = webhookMap[d.webhook_id];
          return (
            <div key={d.id} className="border border-border rounded-lg bg-background">
              <button
                className="w-full p-3 flex items-center gap-3 text-left hover:bg-card/60"
                onClick={() => setExpanded(isOpen ? null : d.id)}
              >
                <ChevronRight
                  className={`h-4 w-4 text-muted-foreground/80 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    {statusBadge(d.status)}
                    <code className="text-xs text-foreground">{d.event}</code>
                    <span className="text-xs text-muted-foreground/80">{wh?.name ?? '—'}</span>
                    {d.last_response_status && (
                      <span className="text-xs text-muted-foreground">HTTP {d.last_response_status}</span>
                    )}
                    {d.attempt > 1 && (
                      <span className="text-xs text-muted-foreground/80">tent. {d.attempt}/{d.max_attempts}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground/80 mt-1">
                    {format(new Date(d.created_at), "dd/MM HH:mm:ss", { locale: ptBR })}
                    {d.duration_ms != null && <> · {d.duration_ms}ms</>}
                  </div>
                </div>
                <div onClick={(e) => e.stopPropagation()} className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => resendMut.mutate(d.id)}
                    disabled={resendMut.isPending}
                  >
                    <RotateCcw className="h-3 w-3 mr-1" /> Reenviar
                  </Button>
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-border p-4 space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-muted-foreground/80">Delivery ID</span>
                      <div className="font-mono text-foreground break-all">{d.id}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground/80">Correlation ID</span>
                      <div className="font-mono text-foreground break-all">{d.correlation_id}</div>
                    </div>
                  </div>
                  {d.last_error && (
                    <div>
                      <div className="text-muted-foreground/80 mb-1">Erro</div>
                      <pre className="bg-destructive/20 border border-destructive/30 p-2 rounded text-destructive whitespace-pre-wrap">
                        {d.last_error}
                      </pre>
                    </div>
                  )}
                  {d.last_response_body && (
                    <div>
                      <div className="text-muted-foreground/80 mb-1">Resposta</div>
                      <pre className="bg-card border border-border p-2 rounded text-foreground whitespace-pre-wrap max-h-40 overflow-auto">
                        {d.last_response_body}
                      </pre>
                    </div>
                  )}
                  <div>
                    <div className="text-muted-foreground/80 mb-1">Headers enviados</div>
                    <pre className="bg-card border border-border p-2 rounded text-foreground whitespace-pre-wrap max-h-40 overflow-auto">
                      {JSON.stringify(d.last_request_headers, null, 2)}
                    </pre>
                  </div>
                  <div>
                    <div className="text-muted-foreground/80 mb-1">Payload</div>
                    <pre className="bg-card border border-border p-2 rounded text-foreground whitespace-pre-wrap max-h-72 overflow-auto">
                      {JSON.stringify(d.payload, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
